// Musical + visual constants shared by every stage.

export const STEPS = 16 // sixteen eighth-notes = two bars = one loop
export const FRAME_COUNT = 8 // eight drawn frames across that same loop
export const CANVAS_SIZE = 512

/** Everything is locked to C major pentatonic, so nothing anyone taps is wrong. */
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export type TrackKind = 'drums' | 'bass' | 'chords' | 'melody'

export interface TrackDef {
  kind: TrackKind
  name: string
  color: string
  hint: string
  /** Row labels, top row first. */
  rows: string[]
  /** Pitches per row (Hz), top row first. Empty for drums. */
  freqs: number[][]
}

export const TRACKS: TrackDef[] = [
  {
    kind: 'drums',
    name: 'Drums',
    color: '#FF6B5A',
    hint: 'the pulse everyone else leans on',
    rows: ['Hat', 'Snare', 'Kick'],
    freqs: [],
  },
  {
    kind: 'bass',
    name: 'Bass',
    color: '#FFC24B',
    hint: 'low and sparse beats low and busy',
    rows: ['A', 'G', 'E', 'D', 'C'],
    freqs: [[midi(45)], [midi(43)], [midi(40)], [midi(38)], [midi(36)]],
  },
  {
    kind: 'chords',
    name: 'Chords',
    color: '#5FD6A6',
    hint: 'hold one for a bar, let it bloom',
    rows: ['C', 'Am', 'F', 'G'],
    freqs: [
      [midi(60), midi(64), midi(67)],
      [midi(57), midi(60), midi(64)],
      [midi(53), midi(57), midi(60)],
      [midi(55), midi(59), midi(62)],
    ],
  },
  {
    kind: 'melody',
    name: 'Melody',
    color: '#8FA8FF',
    hint: 'leave gaps — the gaps are the tune',
    rows: ['A', 'G', 'E', 'D', 'C'],
    freqs: [[midi(81)], [midi(79)], [midi(76)], [midi(74)], [midi(72)]],
  },
]

export const TRACK_COLORS = TRACKS.map((t) => t.color)

/* Six, so they sit on one row in the tools panel. The near-black that used to
   be here was invisible against the drawing surface anyway. */
export const DRAW_COLORS = [
  '#F2EDE6',
  '#FF6B5A',
  '#FFC24B',
  '#5FD6A6',
  '#8FA8FF',
  '#E77BD1',
]

export const cellKey = (track: number, row: number, step: number) => `${track}:${row}:${step}`
