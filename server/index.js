// Loop Room — realtime room server.
//
// Deliberately small: rooms live in memory, state is a plain object, and every
// mutation is broadcast to the room. The one interesting piece is the clock:
// clients ping us to learn the offset between their Date.now() and ours, then
// schedule their own audio against a shared `startedAt` timestamp. Nobody
// streams audio to anybody — every browser plays the same song from the same
// grid at the same moment on its own. See README for why.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

// LOOP_PORT wins in dev (the dev script sets it) so we never fight Vite for a
// port; hosts like Render only set PORT, which is what we want in production.
const PORT = Number(process.env.LOOP_PORT || process.env.PORT) || 8787
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')

const TRACK_COUNT = 4
const STEPS = 16
const MAX_ROWS = 6
const FRAME_COUNT = 8
const MAX_FRAME_BYTES = 900_000 // a 512px PNG dataURL sits well under this
const EMPTY_ROOM_TTL = 1000 * 60 * 30

const COLORS = ['#FF6B5A', '#FFC24B', '#5FD6A6', '#8FA8FF']
const TRACK_NAMES = ['Drums', 'Bass', 'Chords', 'Melody']

/** @type {Map<string, Room>} */
const rooms = new Map()

const nowMs = () => Date.now()
const uid = () => Math.random().toString(36).slice(2, 10)

function makeCode() {
  // No vowels, so we never generate a word anyone has to read out awkwardly.
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ'
  let code
  do {
    code = Array.from({ length: 4 }, () => alphabet[(Math.random() * alphabet.length) | 0]).join('')
  } while (rooms.has(code))
  return code
}

function createRoom(code) {
  const room = {
    code,
    hostId: null,
    stage: 'jam',
    bpm: 100,
    startedAt: nowMs(),
    cells: Object.create(null), // "track:row:step" -> true
    players: new Map(), // id -> player
    sockets: new Map(), // id -> ws
    frames: new Map(), // index -> { index, by, byName, data }
    frameCount: FRAME_COUNT,
    currentFrame: 0,
    emptySince: null,
  }
  rooms.set(code, room)
  return room
}

function freeTrack(room) {
  const taken = new Set([...room.players.values()].map((p) => p.track))
  for (let i = 0; i < TRACK_COUNT; i++) if (!taken.has(i)) return i
  return null // spectator; can still claim a track later
}

function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    stage: room.stage,
    bpm: room.bpm,
    startedAt: room.startedAt,
    cells: room.cells,
    frameCount: room.frameCount,
    currentFrame: room.currentFrame,
    players: [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt),
    // Metadata only — the pixels travel in their own `frame` messages.
    frameMeta: [...room.frames.values()].map(({ index, by, byName }) => ({ index, by, byName })),
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, exceptId) {
  const payload = JSON.stringify(msg)
  for (const [id, ws] of room.sockets) {
    if (id === exceptId) continue
    if (ws.readyState === 1) ws.send(payload)
  }
}

function pushState(room) {
  broadcast(room, { t: 'state', state: publicState(room) })
}

/** Whose turn is it to draw frame `index`? Round-robin over join order. */
function drawerFor(room, index) {
  const order = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)
  if (!order.length) return null
  return order[index % order.length].id
}

function advanceStage(room, stage) {
  if (!['jam', 'draw', 'reveal'].includes(stage)) return
  room.stage = stage
  if (stage === 'draw') {
    // Realign the loop so frame 0 starts on beat one when drawing begins.
    room.startedAt = nowMs()
    room.currentFrame = smallestUndrawn(room)
  }
  pushState(room)
}

function smallestUndrawn(room) {
  for (let i = 0; i < room.frameCount; i++) if (!room.frames.has(i)) return i
  return room.frameCount - 1
}

// ---------------------------------------------------------------- http + ws

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
}

const server = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end(`ok ${rooms.size} rooms`)
  }
  // In dev, Vite serves the app and proxies /ws here, so this branch is unused.
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('Run `npm run dev` (Vite serves the app) or `npm run build` first.')
  }
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let file = join(DIST, normalize(urlPath))
  if (!file.startsWith(DIST) || !existsSync(file) || urlPath === '/') file = join(DIST, 'index.html')
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(500).end('error')
  }
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2_000_000 })

wss.on('connection', (ws) => {
  let id = uid()
  /** @type {Room|null} */
  let room = null

  ws.on('message', (raw) => {
    let m
    try {
      m = JSON.parse(raw.toString())
    } catch {
      return
    }

    // Clock sync — answered before anything else and without touching state.
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, s: nowMs() })

    if (m.t === 'join') {
      const code = String(m.room || '').toUpperCase().slice(0, 6)
      const wanted = code && rooms.get(code)
      if (code && !wanted) return send(ws, { t: 'error', message: `No room called ${code}.` })
      room = wanted || createRoom(makeCode())
      room.emptySince = null

      const player = {
        id,
        name: String(m.name || '').slice(0, 16) || 'Player',
        track: freeTrack(room),
        color: COLORS[room.players.size % COLORS.length],
        joinedAt: nowMs(),
      }
      if (player.track !== null) player.color = COLORS[player.track]
      room.players.set(id, player)
      room.sockets.set(id, ws)
      if (!room.hostId) room.hostId = id

      send(ws, { t: 'welcome', you: id, state: publicState(room), trackNames: TRACK_NAMES })
      for (const f of room.frames.values()) send(ws, { t: 'frame', ...f })
      broadcast(room, { t: 'state', state: publicState(room) }, id)
      return
    }

    if (!room) return
    const me = room.players.get(id)
    if (!me) return

    switch (m.t) {
      case 'cell': {
        const { track, row, step, on } = m
        if (!Number.isInteger(track) || track < 0 || track >= TRACK_COUNT) return
        if (!Number.isInteger(row) || row < 0 || row >= MAX_ROWS) return
        if (!Number.isInteger(step) || step < 0 || step >= STEPS) return
        // The UI only offers you your own instrument; the server should agree.
        // Unclaimed instruments stay open so one person can build a whole loop.
        const owner = [...room.players.values()].find((p) => p.track === track)
        if (owner && owner.id !== id) return
        const key = `${track}:${row}:${step}`
        if (on) room.cells[key] = true
        else delete room.cells[key]
        // Cheap targeted patch — toggling a pad shouldn't cost a full state sync.
        broadcast(room, { t: 'cell', track, row, step, on: !!on })
        break
      }
      case 'claim': {
        const track = m.track
        if (!Number.isInteger(track) || track < 0 || track >= TRACK_COUNT) return
        const holder = [...room.players.values()].find((p) => p.track === track && p.id !== id)
        if (holder) return // already someone's instrument
        me.track = track
        me.color = COLORS[track]
        pushState(room)
        break
      }
      case 'bpm': {
        const bpm = Math.max(60, Math.min(160, Math.round(m.bpm)))
        if (!Number.isFinite(bpm)) return
        room.bpm = bpm
        room.startedAt = nowMs() // restart the loop so tempo changes land cleanly
        pushState(room)
        break
      }
      case 'name': {
        me.name = String(m.name || '').slice(0, 16) || 'Player'
        pushState(room)
        break
      }
      case 'stage': {
        if (id !== room.hostId) return
        advanceStage(room, m.stage)
        break
      }
      case 'stroke': {
        // Live ink so the four people who aren't drawing have something to watch.
        if (room.stage !== 'draw') return
        broadcast(room, { t: 'stroke', from: id, ...m.stroke }, id)
        break
      }
      case 'frame': {
        if (room.stage !== 'draw') return
        const index = m.index
        if (!Number.isInteger(index) || index < 0 || index >= room.frameCount) return
        if (typeof m.data !== 'string' || m.data.length > MAX_FRAME_BYTES) return
        const frame = { index, by: id, byName: me.name, data: m.data }
        room.frames.set(index, frame)
        broadcast(room, { t: 'frame', ...frame })
        room.currentFrame = smallestUndrawn(room)
        if (room.frames.size >= room.frameCount) room.stage = 'reveal'
        pushState(room)
        break
      }
      case 'clearFrame': {
        if (room.frames.delete(m.index)) {
          broadcast(room, { t: 'frameCleared', index: m.index })
          room.currentFrame = smallestUndrawn(room)
          pushState(room)
        }
        break
      }
      case 'reset': {
        if (id !== room.hostId) return
        room.frames.clear()
        room.currentFrame = 0
        room.stage = 'jam'
        room.startedAt = nowMs()
        broadcast(room, { t: 'resetAll' })
        pushState(room)
        break
      }
      case 'skipTurn': {
        room.currentFrame = Math.min(room.frameCount - 1, room.currentFrame + 1)
        pushState(room)
        break
      }
    }
  })

  ws.on('close', () => {
    if (!room) return
    room.players.delete(id)
    room.sockets.delete(id)
    if (room.hostId === id) room.hostId = [...room.players.keys()][0] || null
    if (room.players.size === 0) room.emptySince = nowMs()
    else pushState(room)
  })
})

// Reap rooms nobody came back to.
setInterval(() => {
  const cutoff = nowMs() - EMPTY_ROOM_TTL
  for (const [code, room] of rooms) {
    if (room.emptySince && room.emptySince < cutoff) rooms.delete(code)
  }
}, 60_000).unref()

server.listen(PORT, () => {
  console.log(`\n  Loop Room server → http://localhost:${PORT}  (ws on /ws)\n`)
})
