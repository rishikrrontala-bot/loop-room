import { useState } from 'react'
import type { RoomState, Stage } from '../types'
import { TRACKS } from '../config'
import { Icon } from './Icon'

interface Props {
  state: RoomState
  you: string
  muted: boolean
  onToggleMute: () => void
}

const ORDER: { key: Stage; label: string }[] = [
  { key: 'jam', label: 'Jam' },
  { key: 'draw', label: 'Draw' },
  { key: 'reveal', label: 'Keep' },
]

export function TopBar({ state, you, muted, onToggleMute }: Props) {
  const [copied, setCopied] = useState(false)
  const at = ORDER.findIndex((s) => s.key === state.stage)

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}?r=${state.code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        Loop Room
      </div>

      <button className="roomcode" onClick={copyLink} title="Copy the invite link">
        <small>{copied ? 'COPIED' : 'ROOM'}</small>
        {state.code}
        <Icon name={copied ? 'check' : 'copy'} size={13} />
      </button>

      <nav className="progress" aria-label="Session progress">
        {ORDER.map((s, i) => (
          <span
            key={s.key}
            className={i === at ? 'on' : i < at ? 'done' : ''}
            aria-current={i === at ? 'step' : undefined}
          >
            {s.label}
            {i < ORDER.length - 1 && <em>&nbsp;/&nbsp;</em>}
          </span>
        ))}
      </nav>

      <button
        className="iconbtn"
        onClick={onToggleMute}
        aria-pressed={muted}
        title={muted ? 'Turn the sound on' : 'Mute'}
      >
        <Icon name={muted ? 'soundOff' : 'sound'} size={16} />
      </button>

      <div className="roster">
        {state.players.map((p) => (
          <div key={p.id} className={`chip${p.id === you ? ' me' : ''}`}>
            <span className="swatch" style={{ background: p.color, color: p.color }} />
            {p.name}
            {p.id === you && ' (you)'}
            <span className="role">{p.track !== null ? TRACKS[p.track].name : 'watching'}</span>
          </div>
        ))}
      </div>
    </header>
  )
}
