import { useEffect, useRef, useState } from 'react'
import type { LoopEngine } from './audio'

/**
 * Follows the shared loop on the animation frame. Returns the current step
 * (which changes a few times a second, cheap to re-render on) and fills a ref
 * with the smooth 0..1 phase for anything that wants to move every frame
 * without dragging React along with it.
 */
export function useLoopClock(engine: LoopEngine, active = true) {
  const [step, setStep] = useState(0)
  const phaseRef = useRef(0)
  const onFrame = useRef<((phase: number, step: number) => void) | null>(null)

  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = -1
    const loop = () => {
      const phase = engine.loopPhase()
      phaseRef.current = phase
      const s = Math.floor(phase * 16) % 16
      if (s !== last) {
        last = s
        setStep(s)
      }
      onFrame.current?.(phase, s)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, active])

  return { step, phaseRef, onFrame }
}
