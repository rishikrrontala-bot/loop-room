import { useEffect, useRef, useState } from 'react'
import type { LoopEngine } from '../audio'
import { LoopScene, type SceneMode } from '../three/LoopScene'

interface Props {
  engine: LoopEngine
  cells: Record<string, boolean>
  mode: SceneMode
  projectionSource?: HTMLCanvasElement | null
  /** Fired once if the WebGL context can't be created, so callers can fall back. */
  onUnavailable?: () => void
}

/**
 * Owns the WebGL surface. If the context can't be created — old hardware,
 * blocklisted driver, a locked-down browser — we render nothing here and the
 * CSS beneath carries the page on its own. The app never depends on it.
 */
export function Stage3D({ engine, cells, mode, projectionSource, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<LoopScene | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: LoopScene
    try {
      scene = new LoopScene(canvas)
    } catch (err) {
      console.warn('WebGL unavailable, falling back to flat backdrop', err)
      setFailed(true)
      onUnavailable?.()
      return
    }
    sceneRef.current = scene
    scene.sampler = () => ({ phase: engine.loopPhase(), level: engine.level() })
    scene.start()

    const ro = new ResizeObserver(() => scene.resize())
    ro.observe(canvas)

    const onPointer = (e: PointerEvent) => {
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    // A backgrounded tab should not be burning someone's battery on a disc
    // nobody is looking at.
    const onVisibility = () => (document.hidden ? scene.stop() : scene.start())
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      scene.dispose()
      sceneRef.current = null
    }
  }, [engine])

  useEffect(() => {
    sceneRef.current?.setPattern(cells)
  }, [cells])

  useEffect(() => {
    sceneRef.current?.setMode(mode)
  }, [mode])

  useEffect(() => {
    if (projectionSource) sceneRef.current?.setProjectionSource(projectionSource)
  }, [projectionSource])

  if (failed) return null
  return <canvas ref={canvasRef} className="stage3d" aria-hidden="true" />
}
