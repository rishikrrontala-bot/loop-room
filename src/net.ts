// Thin websocket client with an NTP-flavoured clock sync.
//
// We ping the server a few times a second at first, then settle down. The
// sample with the smallest round trip is the most trustworthy, so that's the
// one whose offset we keep: offset = serverTime + rtt/2 - clientTime.

type Handler = (msg: any) => void

export class Net {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private pingTimer: number | null = null
  private bestRtt = Infinity
  private pings = 0

  offset = 0
  onOpen: (() => void) | null = null
  onClose: (() => void) | null = null
  /** Set once the clock is trustworthy enough to schedule audio against. */
  onClockReady: (() => void) | null = null
  private clockReadySent = false

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws

    ws.onopen = () => {
      this.pings = 0
      this.bestRtt = Infinity
      this.clockReadySent = false
      this.schedulePings()
      this.onOpen?.()
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.t === 'pong') return this.absorbPong(msg)
      for (const h of this.handlers) h(msg)
    }

    ws.onclose = () => {
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
      this.pingTimer = null
      this.onClose?.()
    }
  }

  private schedulePings() {
    const fire = () => this.send({ t: 'ping', c: Date.now() })
    fire()
    // Burst first (converge fast), then keep a slow heartbeat to fight drift.
    let n = 0
    const burst = window.setInterval(() => {
      fire()
      if (++n >= 6) {
        window.clearInterval(burst)
        this.pingTimer = window.setInterval(fire, 8000)
      }
    }, 220)
  }

  private absorbPong(msg: { c: number; s: number }) {
    const now = Date.now()
    const rtt = now - msg.c
    this.pings++
    if (rtt < this.bestRtt) {
      this.bestRtt = rtt
      this.offset = msg.s + rtt / 2 - now
    }
    if (!this.clockReadySent && this.pings >= 3) {
      this.clockReadySent = true
      this.onClockReady?.()
    }
  }

  on(h: Handler) {
    this.handlers.add(h)
    return () => this.handlers.delete(h)
  }

  send(msg: any) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg))
  }

  get ready() {
    return this.ws?.readyState === 1
  }

  close() {
    this.ws?.close()
  }
}
