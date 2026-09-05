export interface Player {
  id: string
  name: string
  track: number | null
  color: string
  joinedAt: number
}

export interface FrameMeta {
  index: number
  by: string
  byName: string
}

export type Stage = 'jam' | 'draw' | 'reveal'

export interface RoomState {
  code: string
  hostId: string | null
  stage: Stage
  bpm: number
  startedAt: number
  cells: Record<string, boolean>
  frameCount: number
  currentFrame: number
  players: Player[]
  frameMeta: FrameMeta[]
}

export interface StrokeMsg {
  from?: string
  id: string
  color: string
  size: number
  points: number[] // flat [x0,y0,x1,y1,...] in 0..1 canvas space
  done?: boolean
}
