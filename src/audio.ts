// The loop engine.
//
// No audio crosses the network. Every browser holds the same 4x16 grid and the
// same `startedAt` timestamp, so each one renders the identical song locally.
// That means the jam never degrades with distance or a bad connection — the
// only thing that has to be accurate is the shared clock, and we sync that to
// within a few milliseconds with ping/pong.
//
// Scheduling follows the standard web-audio lookahead pattern (Chris Wilson,
// "A Tale of Two Clocks"): a coarse setInterval decides what to play, and the
// audio thread's own sample clock decides exactly when.

import { STEPS, TRACKS } from './config'

const LOOKAHEAD_S = 0.16
const TICK_MS = 25

export interface EngineState {
  bpm: number
  startedAt: number
  cells: Record<string, boolean>
}

export class LoopEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private limiter!: DynamicsCompressorNode
  private reverb!: ConvolverNode
  private reverbGain!: GainNode
  private recordDest: MediaStreamAudioDestinationNode | null = null
  private analyser: AnalyserNode | null = null
  private levelBuf: Float32Array<ArrayBuffer> | null = null
  private smoothLevel = 0
  private noise!: AudioBuffer

  private timer: number | null = null
  private nextStep: number | null = null
  private state: EngineState = { bpm: 100, startedAt: Date.now(), cells: {} }
  private clockOffset = 0
  private muted = false

  /** Fires on every scheduled step so the UI playhead can follow the audio. */
  onStep: ((step: number, whenMs: number) => void) | null = null

  get stepMs() {
    return 30000 / this.state.bpm // one eighth note
  }

  get loopMs() {
    return this.stepMs * STEPS
  }

  serverNow() {
    return Date.now() + this.clockOffset
  }

  /** 0..1 position through the current loop, from the shared clock. */
  loopPhase() {
    const t = this.serverNow() - this.state.startedAt
    const p = (t % this.loopMs) / this.loopMs
    return p < 0 ? p + 1 : p
  }

  currentStep() {
    return Math.floor(this.loopPhase() * STEPS) % STEPS
  }

  setClockOffset(offset: number) {
    this.clockOffset = offset
  }

  setState(next: Partial<EngineState>) {
    const tempoChanged = next.bpm !== undefined && next.bpm !== this.state.bpm
    const restarted = next.startedAt !== undefined && next.startedAt !== this.state.startedAt
    this.state = { ...this.state, ...next }
    if (tempoChanged || restarted) this.nextStep = null
  }

  setCell(key: string, on: boolean) {
    if (on) this.state.cells[key] = true
    else delete this.state.cells[key]
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.76, this.ctx.currentTime, 0.02)
    }
  }

  get isMuted() {
    return this.muted
  }

  /** Must be called from a user gesture — browsers won't start audio otherwise. */
  async start() {
    if (!this.ctx) this.build()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.tick(), TICK_MS)
    }
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.nextStep = null
  }

  get running() {
    return this.timer !== null
  }

  /** An audio-only MediaStream, for muxing into the recorded video. */
  captureStream(): MediaStream | null {
    if (!this.ctx) return null
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination()
      this.limiter.connect(this.recordDest)
    }
    return this.recordDest.stream
  }

  // ------------------------------------------------------------------ graph

  private build() {
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.76

    // Safety limiter. Four busy tracks sum well past unity and the destination
    // just clamps, which sounds like distortion rather than like loud. Measured
    // peak before this was 1.10.
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -9
    this.limiter.knee.value = 2
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.14
    this.master.connect(this.limiter).connect(ctx.destination)

    // A tiny procedural room. Cheaper than shipping an impulse response and it
    // keeps the app dependency-free.
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = impulse(ctx, 1.7, 2.6)
    this.reverbGain = ctx.createGain()
    this.reverbGain.gain.value = 0.34
    this.reverb.connect(this.reverbGain).connect(this.master)

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.levelBuf = new Float32Array(this.analyser.fftSize)
    this.limiter.connect(this.analyser)

    this.noise = noiseBuffer(ctx)
  }

  /**
   * Smoothed RMS of the master bus, 0..1. The visuals read this rather than a
   * timer, so the lamps are lit by the song the room actually made.
   */
  level() {
    if (!this.analyser || !this.levelBuf) return 0
    this.analyser.getFloatTimeDomainData(this.levelBuf)
    let sum = 0
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] * this.levelBuf[i]
    const rms = Math.sqrt(sum / this.levelBuf.length)
    const scaled = Math.min(1, rms * 3.4)
    // Fast attack, slow release: a kick should snap, not fade in.
    const k = scaled > this.smoothLevel ? 0.55 : 0.08
    this.smoothLevel += (scaled - this.smoothLevel) * k
    return this.smoothLevel
  }

  private tick() {
    const ctx = this.ctx!
    const audioNow = ctx.currentTime
    const serverNow = this.serverNow()
    const stepMs = this.stepMs

    if (this.nextStep === null) {
      this.nextStep = Math.max(0, Math.ceil((serverNow - this.state.startedAt) / stepMs))
    }

    // Re-derive the server→audio mapping every tick so clock drift self-corrects.
    for (let guard = 0; guard < 64; guard++) {
      const n: number = this.nextStep!
      const stepServerMs = this.state.startedAt + n * stepMs
      const when = audioNow + (stepServerMs - serverNow) / 1000
      if (when > audioNow + LOOKAHEAD_S) break
      if (when >= audioNow - 0.03) {
        const step = ((n % STEPS) + STEPS) % STEPS
        this.playStep(step, when)
        this.onStep?.(step, stepServerMs)
      }
      this.nextStep = n + 1
    }
  }

  private playStep(step: number, when: number) {
    const { cells } = this.state
    for (let t = 0; t < TRACKS.length; t++) {
      const track = TRACKS[t]
      for (let r = 0; r < track.rows.length; r++) {
        if (!cells[`${t}:${r}:${step}`]) continue
        switch (track.kind) {
          case 'drums':
            if (r === 0) this.hat(when)
            else if (r === 1) this.snare(when)
            else this.kick(when)
            break
          case 'bass':
            this.bass(when, track.freqs[r][0])
            break
          case 'chords':
            this.chord(when, track.freqs[r])
            break
          case 'melody':
            this.lead(when, track.freqs[r][0])
            break
        }
      }
    }
  }

  // ----------------------------------------------------------------- voices

  private env(when: number, peak: number, attack: number, decay: number) {
    const g = this.ctx!.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(peak, when + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay)
    return g
  }

  private kick(when: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(165, when)
    osc.frequency.exponentialRampToValueAtTime(44, when + 0.11)
    const g = this.env(when, 0.85, 0.002, 0.3)
    osc.connect(g).connect(this.master)
    osc.start(when)
    osc.stop(when + 0.4)
  }

  private snare(when: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1900
    bp.Q.value = 0.8
    const g = this.env(when, 0.5, 0.002, 0.16)
    src.connect(bp).connect(g).connect(this.master)
    g.connect(this.reverb)
    src.start(when)
    src.stop(when + 0.25)

    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(190, when)
    const bg = this.env(when, 0.3, 0.002, 0.08)
    body.connect(bg).connect(this.master)
    body.start(when)
    body.stop(when + 0.15)
  }

  private hat(when: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7800
    const g = this.env(when, 0.16, 0.001, 0.045)
    src.connect(hp).connect(g).connect(this.master)
    src.start(when)
    src.stop(when + 0.1)
  }

  private bass(when: number, freq: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1200, when)
    lp.frequency.exponentialRampToValueAtTime(320, when + 0.2)
    lp.Q.value = 6
    const g = this.env(when, 0.42, 0.006, 0.3)
    osc.connect(lp).connect(g).connect(this.master)
    osc.start(when)
    osc.stop(when + 0.45)
  }

  private chord(when: number, freqs: number[]) {
    const ctx = this.ctx!
    const g = this.env(when, 0.16, 0.035, 0.75)
    g.connect(this.master)
    g.connect(this.reverb)
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = f
      osc.detune.value = (i - 1) * 4 // a little width
      osc.connect(g)
      osc.start(when)
      osc.stop(when + 0.9)
    })
  }

  private lead(when: number, freq: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const shimmer = ctx.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.value = freq * 2
    const sg = ctx.createGain()
    sg.gain.value = 0.25
    const g = this.env(when, 0.24, 0.008, 0.36)
    osc.connect(g)
    shimmer.connect(sg).connect(g)
    g.connect(this.master)
    g.connect(this.reverb)
    osc.start(when)
    shimmer.start(when)
    osc.stop(when + 0.5)
    shimmer.stop(when + 0.5)
  }
}

function noiseBuffer(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}
