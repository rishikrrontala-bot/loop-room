import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LoopEngine } from '../audio'
import type { Net } from '../net'
import { CANVAS_SIZE, DRAW_COLORS, STEPS } from '../config'
import type { Player, RoomState, StrokeMsg } from '../types'
import { useLoopClock } from '../useLoopClock'
import { Icon } from '../components/Icon'

interface Props {
  state: RoomState
  me: Player | null
  you: string
  net: Net
  engine: LoopEngine
  frames: Record<number, string>
  isHost: boolean
}

const SIZES = [4, 10, 22]
const STROKE_FLUSH_MS = 55

export function Draw({ state, me, you, net, engine, frames, isHost }: Props) {
  const mainRef = useRef<HTMLCanvasElement>(null)
  const onionRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)

  const [color, setColor] = useState(me?.color ?? DRAW_COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [erasing, setErasing] = useState(false)
  const [dirty, setDirty] = useState(false)

  const undoStack = useRef<ImageData[]>([])
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const pending = useRef<number[]>([])
  const strokeId = useRef('')
  const flushTimer = useRef<number | null>(null)
  const remoteLast = useRef<Map<string, { x: number; y: number }>>(new Map())

  const { step } = useLoopClock(engine)

  const order = useMemo(
    () => [...state.players].sort((a, b) => a.joinedAt - b.joinedAt),
    [state.players],
  )
  const index = state.currentFrame
  const drawer = order.length ? order[index % order.length] : null
  const myTurn = drawer?.id === you
  const stepsPerFrame = STEPS / state.frameCount
  const playingFrame = Math.floor(step / stepsPerFrame) % state.frameCount

  // ------------------------------------------------------------- canvases

  const ctxOf = (el: HTMLCanvasElement | null) => el?.getContext('2d') ?? null

  const clearCanvas = useCallback((el: HTMLCanvasElement | null) => {
    const ctx = ctxOf(el)
    if (ctx) ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  }, [])

  // Ghost of the frame before this one, so the animation actually connects.
  useEffect(() => {
    const prev = frames[index - 1] ?? (index === 0 ? frames[state.frameCount - 1] : undefined)
    const ctx = ctxOf(onionRef.current)
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    if (!prev) return
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
    img.src = prev
  }, [frames, index, state.frameCount])

  // Fresh sheet whenever the turn moves on.
  useEffect(() => {
    clearCanvas(mainRef.current)
    clearCanvas(liveRef.current)
    undoStack.current = []
    remoteLast.current.clear()
    setDirty(false)
  }, [index, clearCanvas])

  // Watch someone else's ink arrive in real time.
  useEffect(() => {
    const off = net.on((m: any) => {
      if (m.t === 'stroke') {
        const ctx = ctxOf(liveRef.current)
        if (!ctx || myTurn) return
        paintStroke(ctx, m as StrokeMsg, remoteLast.current)
      } else if (m.t === 'frame' || m.t === 'resetAll') {
        clearCanvas(liveRef.current)
        remoteLast.current.clear()
      }
    })
    return () => {
      off()
    }
  }, [net, myTurn, clearCanvas])

  // ---------------------------------------------------------------- input

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * CANVAS_SIZE,
      y: ((e.clientY - r.top) / r.height) * CANVAS_SIZE,
    }
  }

  const flush = useCallback(
    (done = false) => {
      if (!pending.current.length && !done) return
      net.send({
        t: 'stroke',
        stroke: {
          id: strokeId.current,
          color: erasing ? '#16121e' : color,
          size,
          points: pending.current,
          done,
        },
      })
      pending.current = []
    },
    [net, color, size, erasing],
  )

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!myTurn) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = ctxOf(mainRef.current)!
    if (undoStack.current.length >= 8) undoStack.current.shift()
    undoStack.current.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE))

    drawing.current = true
    strokeId.current = Math.random().toString(36).slice(2, 8)
    const p = pos(e)
    last.current = p
    pending.current = [p.x / CANVAS_SIZE, p.y / CANVAS_SIZE]
    dot(ctx, p.x, p.y, size, color, erasing)
    setDirty(true)
    if (flushTimer.current === null) {
      flushTimer.current = window.setInterval(() => flush(), STROKE_FLUSH_MS)
    }
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !myTurn) return
    const ctx = ctxOf(mainRef.current)!
    const p = pos(e)
    line(ctx, last.current!, p, size, color, erasing)
    last.current = p
    pending.current.push(p.x / CANVAS_SIZE, p.y / CANVAS_SIZE)
  }

  const onUp = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    flush(true)
    if (flushTimer.current !== null) {
      window.clearInterval(flushTimer.current)
      flushTimer.current = null
    }
  }

  useEffect(
    () => () => {
      if (flushTimer.current !== null) window.clearInterval(flushTimer.current)
    },
    [],
  )

  const undo = () => {
    const prev = undoStack.current.pop()
    const ctx = ctxOf(mainRef.current)
    if (!prev || !ctx) return
    ctx.putImageData(prev, 0, 0)
  }

  const submit = () => {
    const el = mainRef.current
    if (!el) return
    net.send({ t: 'frame', index, data: el.toDataURL('image/png') })
    setDirty(false)
  }

  const drawnCount = Object.keys(frames).length

  return (
    <>
      <div className="stagehead">
        <div>
          <h2>
            Frame {index + 1} <span style={{ color: 'var(--ink-faint)' }}>of {state.frameCount}</span>
          </h2>
          <p className="lede">
            The loop is still playing. Draw to it — this frame is on screen for exactly
            two beats, so keep it loose.
          </p>
        </div>
        <div className="meter">
          <span>Playing</span>
          {Array.from({ length: state.frameCount }, (_, i) => (
            <i key={i} className={playingFrame === i ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="drawwrap">
        <div className="canvas-panel">
          <div className="canvas-stack">
            <span className="canvas-badge">
              {myTurn ? 'Your turn' : `${drawer?.name ?? 'Someone'} is drawing`}
            </span>
            <canvas ref={onionRef} className="onion" width={CANVAS_SIZE} height={CANVAS_SIZE} />
            <canvas
              ref={mainRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              style={{ cursor: myTurn ? 'crosshair' : 'default' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <canvas ref={liveRef} className="live" width={CANVAS_SIZE} height={CANVAS_SIZE} />
            {!myTurn && (
              <div className="waiting-veil">
                <strong style={{ color: drawer?.color }}>{drawer?.name ?? 'Waiting'}</strong>
                <span>is drawing frame {index + 1}. You're up soon.</span>
              </div>
            )}
          </div>
        </div>

        <aside className="sidebar">
          <div className="panel">
            <h3>Filmstrip</h3>
            <div className="filmstrip">
              {Array.from({ length: state.frameCount }, (_, i) => {
                const meta = state.frameMeta.find((f) => f.index === i)
                const owner = state.players.find((p) => p.id === meta?.by)
                return (
                  <div
                    key={i}
                    className={`frame-cell${i === index ? ' current' : ''}${
                      playingFrame === i ? ' playing' : ''
                    }`}
                  >
                    {frames[i] ? <img src={frames[i]} alt={`Frame ${i + 1}`} /> : i + 1}
                    {owner && <span className="owner" style={{ background: owner.color }} />}
                  </div>
                )
              })}
            </div>
          </div>

          {myTurn && (
            <>
              <div className="panel">
                <h3>Ink</h3>
                <div className="swatches">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch-btn${!erasing && color === c ? ' sel' : ''}`}
                      style={{ background: c }}
                      aria-label={`Colour ${c}`}
                      onClick={() => {
                        setColor(c)
                        setErasing(false)
                      }}
                    />
                  ))}
                </div>
                <div className="sizes" style={{ marginTop: 12 }}>
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      className={`size-btn${size === s && !erasing ? ' sel' : ''}`}
                      onClick={() => {
                        setSize(s)
                        setErasing(false)
                      }}
                    >
                      <i style={{ width: s, height: s }} />
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className={`btn ghost${erasing ? ' primary' : ''}`}
                    style={{ padding: '9px 10px', fontSize: 13 }}
                    onClick={() => setErasing((v) => !v)}
                  >
                    <Icon name="eraser" size={15} /> Eraser
                  </button>
                  <button
                    className="btn ghost"
                    style={{ padding: '9px 10px', fontSize: 13 }}
                    onClick={undo}
                  >
                    <Icon name="undo" size={15} /> Undo
                  </button>
                </div>
              </div>

              <button className="btn primary big" onClick={submit} disabled={!dirty}>
                {dirty ? 'Add this frame' : 'Draw something first'}
                {dirty && <Icon name="arrowRight" />}
              </button>
              <button
                className="btn ghost"
                style={{ fontSize: 13 }}
                onClick={() => net.send({ t: 'skipTurn' })}
              >
                <Icon name="skip" size={14} /> Skip this frame
              </button>
            </>
          )}

          {!myTurn && (
            <div className="panel">
              <h3>Turn order</h3>
              <div className="credits">
                {order.map((p, i) => (
                  <div className="credit-line" key={p.id}>
                    <span className="swatch" style={{ background: p.color }} />
                    {p.name}
                    <span className="what">
                      {p.id === drawer?.id ? 'drawing now' : `frame ${(i % order.length) + 1}, ${
                        (i % order.length) + 1 + order.length
                      }`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="actionbar">
        <span className="note">
          <b>{drawnCount}</b> of {state.frameCount} frames drawn.{' '}
          <span className="hint-serif">The song keeps looping while you draw.</span>
        </span>
        {isHost && drawnCount > 0 && (
          <button className="btn" onClick={() => net.send({ t: 'stage', stage: 'reveal' })}>
            Play it back <Icon name="arrowRight" size={15} />
          </button>
        )}
        {isHost && (
          <button className="btn ghost" onClick={() => net.send({ t: 'stage', stage: 'jam' })}>
            <Icon name="arrowLeft" size={15} /> Back to the loop
          </button>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ helpers

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  erase: boolean,
) {
  ctx.save()
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function line(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  color: string,
  erase: boolean,
) {
  ctx.save()
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = color
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

/** Replay a batch of normalised points from another player's brush. */
function paintStroke(
  ctx: CanvasRenderingContext2D,
  s: StrokeMsg,
  lastMap: Map<string, { x: number; y: number }>,
) {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < s.points.length; i += 2) {
    pts.push({ x: s.points[i] * CANVAS_SIZE, y: s.points[i + 1] * CANVAS_SIZE })
  }
  let prev = lastMap.get(s.id) ?? pts[0]
  if (prev && pts.length === 1 && !lastMap.has(s.id)) dot(ctx, prev.x, prev.y, s.size, s.color, false)
  for (const p of pts) {
    if (prev) line(ctx, prev, p, s.size, s.color, false)
    prev = p
  }
  if (prev) lastMap.set(s.id, prev)
  if (s.done) lastMap.delete(s.id)
}
