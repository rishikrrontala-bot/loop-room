import { useCallback, useEffect, useRef } from 'react'
import type { LoopEngine } from '../audio'
import type { Net } from '../net'
import { STEPS, TRACKS } from '../config'
import type { Player, RoomState } from '../types'
import { useLoopClock } from '../useLoopClock'
import { Icon } from '../components/Icon'

interface Props {
  state: RoomState
  me: Player | null
  you: string
  net: Net
  engine: LoopEngine
  isHost: boolean
  onCell: (track: number, row: number, step: number, on: boolean) => void
}

export function Jam({ state, me, net, engine, isHost, onCell }: Props) {
  const { step } = useLoopClock(engine)
  const painting = useRef<null | boolean>(null)

  useEffect(() => {
    const up = () => (painting.current = null)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const ownerOf = useCallback(
    (track: number) => state.players.find((p) => p.track === track) ?? null,
    [state.players],
  )

  const paint = (t: number, r: number, s: number, on: boolean) => onCell(t, r, s, on)

  const surprise = (t: number) => {
    const kind = TRACKS[t].kind
    const rows = TRACKS[t].rows.length
    const put = (r: number, s: number) => paint(t, r, s, true)
    // Clear first so repeat presses give a genuinely new idea.
    for (let r = 0; r < rows; r++)
      for (let s = 0; s < STEPS; s++) if (state.cells[`${t}:${r}:${s}`]) paint(t, r, s, false)

    if (kind === 'drums') {
      for (let s = 0; s < STEPS; s += 4) put(2, s) // kick on the beat
      if (Math.random() > 0.5) put(2, 6)
      put(1, 4)
      put(1, 12) // snare on 2 and 4
      for (let s = Math.random() > 0.5 ? 0 : 1; s < STEPS; s += 2) put(0, s)
    } else if (kind === 'bass') {
      const root = 4 // low C
      for (let s = 0; s < STEPS; s += 4) put(Math.random() > 0.7 ? 3 : root, s)
      if (Math.random() > 0.5) put(2, 7)
    } else if (kind === 'chords') {
      const prog = [0, 3, 1, 2].sort(() => Math.random() - 0.5)
      prog.forEach((c, i) => put(c, i * 4))
    } else {
      for (let s = 1; s < STEPS; s += 2) {
        if (Math.random() > 0.55) put((Math.random() * rows) | 0, s)
      }
    }
  }

  const clearTrack = (t: number) => {
    for (let r = 0; r < TRACKS[t].rows.length; r++)
      for (let s = 0; s < STEPS; s++) if (state.cells[`${t}:${r}:${s}`]) paint(t, r, s, false)
  }

  const noteCount = Object.keys(state.cells).length

  return (
    <>
      <div className="stagehead">
        <div>
          <h2>Build the loop.</h2>
          <p className="lede">
            Everything is locked to one scale, so there is no wrong pad. Two bars, on
            repeat, forever — until it sounds like something.
          </p>
        </div>
        <div className="meter">
          <span>Loop</span>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} className={Math.floor(step / 2) === i ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="transport">
        <div className="tempo">
          <label htmlFor="bpm">Tempo</label>
          <input
            id="bpm"
            type="range"
            min={70}
            max={140}
            step={1}
            value={state.bpm}
            onChange={(e) => net.send({ t: 'bpm', bpm: Number(e.target.value) })}
          />
          <output>{state.bpm} BPM</output>
        </div>
        <span className="hint-serif" style={{ marginLeft: 'auto', fontSize: 13.5 }}>
          {noteCount === 0
            ? 'Empty room. Someone press a pad.'
            : `${noteCount} note${noteCount === 1 ? '' : 's'} between you.`}
        </span>
      </div>

      <div className="tracks">
        {TRACKS.map((track, t) => {
          const owner = ownerOf(t)
          const mine = me?.track === t
          const free = !owner
          return (
            <section
              key={t}
              className={`track${mine ? ' mine' : ''}${free ? ' unclaimed' : ''}`}
              style={{ ['--tc' as string]: track.color }}
            >
              <div className="track-head">
                <span className="track-name">{track.name}</span>
                <span className="track-owner">
                  {owner ? (mine ? 'yours' : owner.name) : 'nobody yet'}
                </span>
                {free && (
                  <button className="pill" onClick={() => net.send({ t: 'claim', track: t })}>
                    Take it
                  </button>
                )}
                {mine && (
                  <>
                    <button className="pill" onClick={() => surprise(t)}>
                      <Icon name="dice" size={13} /> Surprise me
                    </button>
                    <button className="pill" onClick={() => clearTrack(t)}>
                      Clear
                    </button>
                  </>
                )}
                <span className="track-hint">{track.hint}</span>
              </div>

              <div className="gridwrap">
                <div
                  className="playhead"
                  style={{ transform: `translateX(${step * 100}%)` }}
                  aria-hidden
                />
                {track.rows.map((label, r) => (
                  <div className="gridrow" key={r}>
                    <span className="rowlabel">{label}</span>
                    <div className="pads">
                      {Array.from({ length: STEPS }, (_, s) => {
                        const on = !!state.cells[`${t}:${r}:${s}`]
                        return (
                          <button
                            key={s}
                            className={`pad${on ? ' on' : ''}${s % 4 === 0 ? ' beat' : ''}${
                              on && s === step ? ' hit' : ''
                            }`}
                            disabled={!mine}
                            aria-label={`${track.name} ${label} step ${s + 1}`}
                            aria-pressed={on}
                            onPointerDown={(e) => {
                              if (!mine) return
                              e.preventDefault()
                              painting.current = !on
                              paint(t, r, s, !on)
                            }}
                            onPointerEnter={() => {
                              if (!mine || painting.current === null) return
                              if (on !== painting.current) paint(t, r, s, painting.current)
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="actionbar">
        <span className="note">
          {me?.track === null ? (
            <>Grab a free instrument above to join in.</>
          ) : (
            <>
              You're on <b>{me?.track !== null && me ? TRACKS[me.track!].name : ''}</b>. Everyone
              hears the same loop, played on their own machine.
            </>
          )}
        </span>
        {isHost ? (
          <button
            className="btn primary"
            disabled={noteCount === 0}
            onClick={() => net.send({ t: 'stage', stage: 'draw' })}
          >
            {noteCount === 0 ? 'Add a note first' : 'Lock it in, draw the video'}
            {noteCount > 0 && <Icon name="arrowRight" />}
          </button>
        ) : (
          <span className="hint-serif">
            {state.players.find((p) => p.id === state.hostId)?.name ?? 'The host'} moves everyone
            on when the loop is ready.
          </span>
        )}
      </div>
    </>
  )
}
