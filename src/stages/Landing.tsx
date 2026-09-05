import { useEffect, useMemo, useState } from 'react'
import type { LoopEngine } from '../audio'
import { Stage3DLazy } from '../components/Stage3DLazy'
import { Icon } from '../components/Icon'
import { TRACKS } from '../config'

interface Props {
  engine: LoopEngine
  onJoin: (name: string, room: string) => void
  error: string | null
  online: boolean
  busy: boolean
}

const NAMES = ['Robin', 'Sunny', 'Marlo', 'Kit', 'Frankie', 'Nova', 'Wren', 'Bo']

/** Nothing is playing yet, so the disc runs a pattern of its own. */
function demoPattern(): Record<string, boolean> {
  const cells: Record<string, boolean> = {}
  const put = (t: number, r: number, steps: number[]) =>
    steps.forEach((s) => (cells[`${t}:${r}:${s}`] = true))
  put(0, 2, [0, 4, 8, 12, 14]) // kick
  put(0, 1, [4, 12]) // snare
  put(0, 0, [0, 2, 4, 6, 8, 10, 12, 14]) // hat
  put(1, 4, [0, 8])
  put(1, 3, [6, 14])
  put(2, 0, [0])
  put(2, 2, [4])
  put(2, 3, [8])
  put(2, 1, [12])
  put(3, 2, [3, 11])
  put(3, 0, [5])
  put(3, 1, [9, 13])
  return cells
}

export function Landing({ engine, onJoin, error, online, busy }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const cells = useMemo(demoPattern, [])

  useEffect(() => {
    const r = new URLSearchParams(location.search).get('r')
    if (r) setCode(r.toUpperCase().slice(0, 4))
    setName(localStorage.getItem('looproom.name') || NAMES[(Math.random() * NAMES.length) | 0])
  }, [])

  const go = (room: string) => {
    const n = name.trim() || 'Player'
    localStorage.setItem('looproom.name', n)
    onJoin(n, room)
  }

  return (
    <>
      <Stage3DLazy engine={engine} cells={cells} mode="hero" />
      <div className="vignette" aria-hidden="true" />
      <div className="landing">
        <div className="landing-inner">
          <h1 className="hero-title">
            Loop
            <span className="l2">Room</span>
          </h1>
          <p className="hero-sub">
            Four friends, one browser tab each. Build a loop together, draw a frame each,
            and leave with a music video none of you could have made alone.
          </p>

          <div className="panel-solid">
            <div className="field">
              <label htmlFor="nm">Your name</label>
              <input
                id="nm"
                className="input"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who's playing?"
              />
            </div>

            <button
              className="btn primary big"
              style={{ width: '100%' }}
              disabled={!online || busy}
              onClick={() => go('')}
            >
              {online ? 'Start a room' : 'Connecting…'}
              {online && <Icon name="arrowRight" size={17} />}
            </button>

            <div className="divider">or join one</div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="code">Room code</label>
              <input
                id="code"
                className="input code"
                value={code}
                maxLength={4}
                placeholder="————"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && go(code)}
              />
            </div>
            <button
              className="btn"
              style={{ width: '100%' }}
              disabled={code.length !== 4 || !online || busy}
              onClick={() => go(code)}
            >
              Join room
            </button>

            {error && <div className="err">{error}</div>}
          </div>

          <div className="timeline">
            <div className="timeline-mark" style={{ ['--mark' as string]: TRACKS[0].color }}>
              <b>Jam</b>
              <span>
                Everyone takes an instrument and taps out a loop. It's locked to one scale,
                so nothing you play can sound wrong.
              </span>
            </div>
            <div className="timeline-mark" style={{ ['--mark' as string]: TRACKS[2].color }}>
              <b>Draw</b>
              <span>
                Eight frames, taken in turns, each drawn over a ghost of the last one while
                the loop keeps playing.
              </span>
            </div>
            <div className="timeline-mark" style={{ ['--mark' as string]: TRACKS[3].color }}>
              <b>Keep</b>
              <span>
                The animation loops to the song. Hit record and take the video away with you.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
