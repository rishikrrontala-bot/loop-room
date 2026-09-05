import { Suspense, lazy } from 'react'
import type { ComponentProps } from 'react'
import type { Stage3D as Stage3DType } from './Stage3D'

// three.js is about two thirds of the bundle and only two of the four stages
// ever show it, so it loads on demand. Nothing waits on it: the fallback is
// null and the CSS beneath carries the page until the scene arrives.
const Stage3D = lazy(() => import('./Stage3D').then((m) => ({ default: m.Stage3D })))

export function Stage3DLazy(props: ComponentProps<typeof Stage3DType>) {
  return (
    <Suspense fallback={null}>
      <Stage3D {...props} />
    </Suspense>
  )
}
