import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LoopEngine } from '../audio'
import type { Net } from '../net'
import { STEPS, TRACKS } from '../config'
import type { RoomState } from '../types'
import { Stage3DLazy } from '../components/Stage3DLazy'
import { Icon } from '../components/Icon'

interface Props {
  state: RoomState
  net: Net
  engine: LoopEngine
  frames: Record<number, string>
  isHost: boolean
}

const OUT = 720

/** webm first, mp4 for Safari. Whichever the browser will actually give us. */
function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null
}

export function Reveal({ state, net, engine, frames, isHost }: Props) {
  // One clean 2D canvas is the single source of truth: the 3D room projects it
  // as a texture, and MediaRecorder captures it directly. The video you take
  // home is the animation, not a screen recording of the room around it.
  const compositeRef = useRef<HTMLCanvasElement>(null)
  const imgs = useRef<(HTMLImageElement | null)[]>([])
  const [recording, setRecording] = useState<'idle' | 'armed' | 'rolling'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [flat, setFlat] = useState(false)
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const mime = useMemo(pickMime, [])

  useEffect(() => setSource(compositeRef.current), [])

  // Decode every frame once, then the render loop is just a drawImage.
  useEffect(() => {
    imgs.current = Array.from({ length: state.frameCount }, () => null)
    for (let i = 0; i < state.frameCount; i++) {
      const src = frames[i]
      if (!src) continue
      const img = new Image()
      img.src = src
      img.decode?.().catch(() => {})
      imgs.current[i] = img
    }
  }, [frames, state.frameCount])

  useEffect(() => {
    let raf = 0
    const render = () => {
      const ctx = compositeRef.current?.getContext('2d')
      if (ctx) {
        const phase = engine.loopPhase()
        const idx = Math.floor(phase * state.frameCount) % state.frameCount
        ctx.fillStyle = '#131020'
        ctx.fillRect(0, 0, OUT, OUT)
        // Hold the last drawn frame if this slot was skipped, so the loop
        // never flashes empty.
        let img = imgs.current[idx]
        for (let back = 1; !img && back <= state.frameCount; back++) {
          img = imgs.current[(idx - back + state.frameCount) % state.frameCount]
        }
        if (img && img.complete) ctx.drawImage(img, 0, 0, OUT, OUT)
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [engine, state.frameCount])

  const record = useCallback(() => {
    const canvas = compositeRef.current
    if (!canvas || !mime) return
    if (engine.isMuted) engine.setMuted(false)

    const stream = canvas.captureStream(30)
    const audio = engine.captureStream()
    audio?.getAudioTracks().forEach((t) => stream.addTrack(t))

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime })
      setVideoUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(blob)
      })
      setRecording('idle')
    }

    // Start on the downbeat and capture exactly two loops, so the file itself
    // loops seamlessly when it plays back.
    setRecording('armed')
    const msToDownbeat = engine.loopMs * (1 - engine.loopPhase())
    window.setTimeout(() => {
      rec.start()
      setRecording('rolling')
      window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), engine.loopMs * 2)
    }, msToDownbeat)
  }, [engine, mime])

  const ext = mime?.includes('mp4') ? 'mp4' : 'webm'
  const drawn = Object.keys(frames).length
  const loopSeconds = (engine.loopMs / 1000).toFixed(1)

  const frameCredit = (id: string) =>
    state.frameMeta.filter((f) => f.by === id).map((f) => f.index + 1)

  return (
    <>
      {!flat && (
        <Stage3DLazy
          engine={engine}
          cells={state.cells}
          mode="projection"
          projectionSource={source}
          onUnavailable={() => setFlat(true)}
        />
      )}

      {/* Experience mode: the film owns the viewport and the interface gets
          out of its way. Everything else is a thin overlay. */}
      <div className="reveal-stage">
        <div className="reveal-head">
          <h2>You made this.</h2>
          <p className="lede">
            {state.players.length > 1
              ? `${state.players.length} people, ${loopSeconds} seconds, and nobody in the room could have predicted it.`
              : `${loopSeconds} seconds on repeat. Bring some friends next time.`}
          </p>
        </div>

        <div className={flat ? 'projection-fallback' : 'projection-offscreen'}>
          <canvas ref={compositeRef} width={OUT} height={OUT} />
        </div>

        {recording !== 'idle' && (
          <div className="rec-dot">
            <i />
            {recording === 'armed' ? 'CUEING' : 'RECORDING'}
          </div>
        )}
      </div>

      <div className="actionbar reveal-bar">
        <div className="bar-credits">
          {state.players.map((p) => {
            const drew = frameCredit(p.id)
            return (
              <span className="bar-credit" key={p.id}>
                <i style={{ background: p.color, color: p.color }} />
                <b>{p.name}</b>
                <em>
                  {p.track !== null ? TRACKS[p.track].name.toLowerCase() : 'watching'}
                  {drew.length > 0 && ` · frame${drew.length > 1 ? 's' : ''} ${drew.join(', ')}`}
                </em>
              </span>
            )
          })}
          <span className="bar-stats tnum">
            {state.bpm} BPM · {loopSeconds}s · {STEPS} steps · {Object.keys(state.cells).length}{' '}
            notes · {drawn}/{state.frameCount} frames
          </span>
        </div>

        {mime ? (
          <button className="btn primary" onClick={record} disabled={recording !== 'idle'}>
            <Icon name="record" />
            {recording === 'idle' ? 'Record two loops' : 'Rolling…'}
          </button>
        ) : (
          <span className="hint-serif">
            This browser won't record video — screen-record the loop instead.
          </span>
        )}

        {videoUrl && (
          <a
            className="btn"
            href={videoUrl}
            download={`loop-room-${state.code}.${ext}`}
            style={{ textDecoration: 'none' }}
          >
            <Icon name="download" />
            Save it
          </a>
        )}

        {isHost && (
          <button
            className="iconbtn"
            title="Draw more frames"
            onClick={() => net.send({ t: 'stage', stage: 'draw' })}
          >
            <Icon name="arrowLeft" size={15} />
          </button>
        )}
        {isHost && (
          <button
            className="btn ghost"
            onClick={() =>
              confirm('Clear the frames and start a new one?') && net.send({ t: 'reset' })
            }
          >
            Start again
          </button>
        )}
      </div>
    </>
  )
}
