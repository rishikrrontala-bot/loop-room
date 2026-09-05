import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Net } from './net'
import { LoopEngine } from './audio'
import type { RoomState } from './types'
import { TopBar } from './components/TopBar'
import { Landing } from './stages/Landing'
import { Jam } from './stages/Jam'
import { Draw } from './stages/Draw'
import { Reveal } from './stages/Reveal'

// One connection and one audio graph for the life of the tab. Module scope
// keeps React's StrictMode double-mount from opening two sockets.
const net = new Net()
const engine = new LoopEngine()
let connectionOpened = false

// Handy from the console when something sounds wrong: window.loopRoom.engine
if (import.meta.env.DEV) (window as any).loopRoom = { net, engine }

// ?mute=1 starts the room silent. Useful for screenshots, for setting up a
// demo in a quiet space, and for anyone joining from a lecture theatre.
const START_MUTED = new URLSearchParams(location.search).has('mute')
if (START_MUTED) engine.setMuted(true)

export default function App() {
  const [state, setState] = useState<RoomState | null>(null)
  const [you, setYou] = useState<string | null>(null)
  const [frames, setFrames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(false)
  const [muted, setMuted] = useState(START_MUTED)
  const [joining, setJoining] = useState(false)

  const lastJoin = useRef<{ room: string; name: string } | null>(null)
  const stageRef = useRef<string | null>(null)

  /**
   * Moving between stages is the one authored transition in the app, so it
   * gets a real one. startViewTransition needs the DOM mutated synchronously
   * inside its callback, hence flushSync.
   */
  const applyState = useCallback((next: RoomState) => {
    const stageChanged = stageRef.current !== null && stageRef.current !== next.stage
    stageRef.current = next.stage
    const start = (document as any).startViewTransition?.bind(document)
    // A hidden document aborts the transition outright, so don't ask for one.
    const wantTransition =
      stageChanged &&
      start &&
      !document.hidden &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches

    if (wantTransition) {
      try {
        const vt = start(() => flushSync(() => setState(next)))
        // An aborted transition still applies the state change, so these
        // rejections are noise. Swallow them rather than logging every one.
        vt?.ready?.catch(() => {})
        vt?.finished?.catch(() => {})
        vt?.updateCallbackDone?.catch(() => {})
      } catch {
        setState(next)
      }
    } else {
      setState(next)
    }
    engine.setState({ bpm: next.bpm, startedAt: next.startedAt, cells: { ...next.cells } })
  }, [])

  useEffect(() => {
    const off = net.on((m: any) => {
      switch (m.t) {
        case 'welcome':
          setYou(m.you)
          setJoining(false)
          setError(null)
          stageRef.current = m.state.stage
          setState(m.state)
          engine.setState({
            bpm: m.state.bpm,
            startedAt: m.state.startedAt,
            cells: { ...m.state.cells },
          })
          break
        case 'state':
          applyState(m.state)
          break
        case 'cell': {
          const key = `${m.track}:${m.row}:${m.step}`
          engine.setCell(key, m.on)
          setState((s) => {
            if (!s) return s
            const cells = { ...s.cells }
            if (m.on) cells[key] = true
            else delete cells[key]
            return { ...s, cells }
          })
          break
        }
        case 'frame':
          setFrames((f) => ({ ...f, [m.index]: m.data }))
          break
        case 'frameCleared':
          setFrames((f) => {
            const next = { ...f }
            delete next[m.index]
            return next
          })
          break
        case 'resetAll':
          setFrames({})
          break
        case 'error':
          setError(m.message)
          setJoining(false)
          break
      }
    })

    net.onOpen = () => {
      setOnline(true)
      // Re-join automatically after a dropped connection — laptops sleep.
      if (lastJoin.current) net.send({ t: 'join', ...lastJoin.current })
    }
    net.onClose = () => {
      setOnline(false)
      setTimeout(() => net.connect(), 1200)
    }
    net.onClockReady = () => engine.setClockOffset(net.offset)

    if (!connectionOpened) {
      connectionOpened = true
      net.connect()
    }

    const drift = window.setInterval(() => engine.setClockOffset(net.offset), 4000)
    return () => {
      off()
      window.clearInterval(drift)
    }
  }, [applyState])

  // Publish the loop to CSS once per frame. Anything that wants to move with
  // the music reads var(--beat) or var(--phase) instead of running its own rAF.
  useEffect(() => {
    let raf = 0
    const root = document.documentElement
    const tick = () => {
      root.style.setProperty('--beat', engine.level().toFixed(3))
      root.style.setProperty('--phase', engine.loopPhase().toFixed(4))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const join = useCallback(async (name: string, room: string) => {
    setJoining(true)
    setError(null)
    lastJoin.current = { room, name }
    // We're inside a click, which is the only moment a browser will let us
    // open an AudioContext. Start the engine here or there's no sound later.
    await engine.start()
    net.send({ t: 'join', room, name })
  }, [])

  const toggleMute = useCallback(() => {
    const next = !engine.isMuted
    engine.setMuted(next)
    setMuted(next)
  }, [])

  // Optimistic: light the pad now, tell the room after. A pad that waits for a
  // server round trip before it lights up feels broken, even at 30ms.
  const applyCell = useCallback((track: number, row: number, step: number, on: boolean) => {
    const key = `${track}:${row}:${step}`
    engine.setCell(key, on)
    setState((s) => {
      if (!s) return s
      const cells = { ...s.cells }
      if (on) cells[key] = true
      else delete cells[key]
      return { ...s, cells }
    })
    net.send({ t: 'cell', track, row, step, on })
  }, [])

  const me = useMemo(
    () => (state && you ? state.players.find((p) => p.id === you) ?? null : null),
    [state, you],
  )

  if (!state || !you) {
    return (
      <Landing engine={engine} onJoin={join} error={error} online={online} busy={joining} />
    )
  }

  const isHost = state.hostId === you

  return (
    <div className="app">
      <TopBar state={state} you={you} muted={muted} onToggleMute={toggleMute} />
      {!online && (
        <div className="err" style={{ margin: '10px 20px 0' }}>
          Connection dropped — reconnecting…
        </div>
      )}
      <main className="stagewrap">
        {state.stage === 'jam' && (
          <Jam
            state={state}
            me={me}
            you={you}
            net={net}
            engine={engine}
            isHost={isHost}
            onCell={applyCell}
          />
        )}
        {state.stage === 'draw' && (
          <Draw
            state={state}
            me={me}
            you={you}
            net={net}
            engine={engine}
            frames={frames}
            isHost={isHost}
          />
        )}
        {state.stage === 'reveal' && (
          <Reveal state={state} net={net} engine={engine} frames={frames} isHost={isHost} />
        )}
      </main>
    </div>
  )
}
