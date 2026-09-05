// The machine.
//
// One scene, two configurations. In `hero` mode it is a circular step
// sequencer: four concentric rings, one per instrument, sixteen nodes each,
// with a beam sweeping them in time with the shared clock. It is the loop,
// drawn as a loop. In `projection` mode the rings fall back and dim, and the
// group's finished animation is projected on a plane in front of them, lit by
// four coloured lamps that pulse to the real audio signal.
//
// No post-processing. The bloom is faked with additive sprites, which costs a
// fraction of an EffectComposer pass and holds 60fps on integrated graphics.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  PlaneGeometry,
  DoubleSide,
} from 'three'
import { STEPS, TRACKS } from '../config'

export type SceneMode = 'hero' | 'projection'

const RING_RADII = [1.25, 1.72, 2.19, 2.66]
const NODE_R = 0.062

interface Node {
  mesh: Mesh
  glow: Sprite
  lit: boolean
  weight: number // how many rows are on at this step
  energy: number // decays after the beam passes
  base: Vector3
}

export class LoopScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera: PerspectiveCamera
  private disc = new Group()
  private rings: Mesh[] = []
  private nodes: Node[][] = []
  private beam!: Mesh
  private core!: Mesh
  private coreGlow!: Sprite
  private dust!: Points
  private lamps: Sprite[] = []
  private screen!: Mesh
  private screenTex: CanvasTexture | null = null

  private raf = 0
  private mode: SceneMode = 'hero'
  private phase = 0
  private lastStep = -1
  private level = 0
  private pointer = { x: 0, y: 0 }
  private target = { x: 0, y: 0 }
  private reduced = false
  private spin = 0
  private modeMix = 0 // 0 = hero, 1 = projection; eased so the switch is a move
  private disposed = false

  /** Pulled once per rendered frame so the scene never lags the audio clock. */
  sampler: (() => { phase: number; level: number }) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new PerspectiveCamera(42, 1, 0.1, 100)
    this.camera.position.set(0, 0.1, 7.7)

    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.buildDisc()
    this.buildDust()
    this.buildScreen()
    this.scene.add(this.disc)

    this.resize()
  }

  // ------------------------------------------------------------------ build

  private buildDisc() {
    const glowTex = radialTexture()

    TRACKS.forEach((track, t) => {
      const color = new Color(track.color)
      const radius = RING_RADII[t]

      const ring = new Mesh(
        new TorusGeometry(radius, 0.0035, 6, 220),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }),
      )
      this.disc.add(ring)
      this.rings.push(ring)

      const row: Node[] = []
      for (let s = 0; s < STEPS; s++) {
        // Step 0 at twelve o'clock, running clockwise like a clock face.
        const a = (s / STEPS) * Math.PI * 2 - Math.PI / 2
        const base = new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)

        const mesh = new Mesh(
          new SphereGeometry(NODE_R, 14, 12),
          new MeshBasicMaterial({ color, transparent: true, opacity: 0.1 }),
        )
        mesh.position.copy(base)

        const glow = new Sprite(
          new SpriteMaterial({
            map: glowTex,
            color,
            blending: AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0,
          }),
        )
        glow.position.copy(base)
        glow.scale.setScalar(0.5)

        this.disc.add(mesh, glow)
        row.push({ mesh, glow, lit: false, weight: 0, energy: 0, base })
      }
      this.nodes.push(row)
    })

    // The sweep. A plane running from the centre out past the last ring,
    // faded along its length so it reads as light rather than geometry.
    this.beam = new Mesh(
      new PlaneGeometry(0.42, 3.2),
      new MeshBasicMaterial({
        map: beamTexture(),
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 1,
        side: DoubleSide,
      }),
    )
    this.beam.position.set(0, 1.6, 0.05)
    const beamPivot = new Group()
    beamPivot.add(this.beam)
    this.disc.add(beamPivot)
    ;(this as any).beamPivot = beamPivot

    this.core = new Mesh(
      new SphereGeometry(0.1, 20, 16),
      new MeshBasicMaterial({ color: 0xf2ede6, transparent: true, opacity: 0.9 }),
    )
    this.coreGlow = new Sprite(
      new SpriteMaterial({
        map: glowTex,
        color: new Color(0xffd9c7),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
      }),
    )
    this.coreGlow.scale.setScalar(1.5)
    this.disc.add(this.core, this.coreGlow)

    this.disc.rotation.x = -0.62
  }

  private buildDust() {
    const count = 420
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 3
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    this.dust = new Points(
      geo,
      new PointsMaterial({
        color: 0x9a8fb5,
        size: 0.018,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    )
    this.scene.add(this.dust)
  }

  private buildScreen() {
    const glowTex = radialTexture()
    this.screen = new Mesh(
      new PlaneGeometry(4.15, 4.15),
      // depthWrite stays on: the screen is a solid object and must occlude the
      // rings behind it, not let them bleed through the picture.
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: true }),
    )
    this.screen.position.set(0, 0, 1.1)
    this.screen.renderOrder = 10
    this.screen.visible = false
    this.scene.add(this.screen)

    // Four lamps behind the screen, one per instrument, breathing with the mix.
    TRACKS.forEach((track, i) => {
      const a = (i / TRACKS.length) * Math.PI * 2 + Math.PI / 4
      const lamp = new Sprite(
        new SpriteMaterial({
          map: glowTex,
          color: new Color(track.color),
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0,
        }),
      )
      lamp.position.set(Math.cos(a) * 2.5, Math.sin(a) * 2.5, -0.6)
      lamp.scale.setScalar(4)
      this.scene.add(lamp)
      this.lamps.push(lamp)
    })
  }

  // ------------------------------------------------------------------- api

  setMode(mode: SceneMode) {
    this.mode = mode
    if (mode === 'projection') this.screen.visible = true
  }

  /** Which steps are lit, from the room's live grid. */
  setPattern(cells: Record<string, boolean>) {
    for (let t = 0; t < this.nodes.length; t++) {
      const rows = TRACKS[t].rows.length
      for (let s = 0; s < STEPS; s++) {
        let weight = 0
        for (let r = 0; r < rows; r++) if (cells[`${t}:${r}:${s}`]) weight++
        const node = this.nodes[t][s]
        node.weight = weight
        node.lit = weight > 0
      }
    }
  }

  setPhase(phase: number) {
    this.phase = phase
  }

  /** 0..1 RMS from the master bus, for the lamps. */
  setLevel(level: number) {
    this.level = level
  }

  setProjectionSource(source: HTMLCanvasElement) {
    this.screenTex?.dispose()
    this.screenTex = new CanvasTexture(source)
    // Without this the canvas is treated as linear and the film renders
    // washed out — the source pixels are vivid, the output was not.
    this.screenTex.colorSpace = SRGBColorSpace
    const mat = this.screen.material as MeshBasicMaterial
    mat.map = this.screenTex
    mat.needsUpdate = true
  }

  setPointer(x: number, y: number) {
    this.target.x = x
    this.target.y = y
  }

  resize() {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Pull the camera back on narrow screens so the disc never crops.
    this.camera.position.z = w < 700 ? 9.6 : 7.7
    this.camera.updateProjectionMatrix()
  }

  start() {
    if (this.raf || this.disposed) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      this.update(dt)
      this.renderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.scene.traverse((o: any) => {
      o.geometry?.dispose?.()
      if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.())
      else o.material?.dispose?.()
    })
    this.screenTex?.dispose()
    this.renderer.dispose()
  }

  // ---------------------------------------------------------------- update

  private update(dt: number) {
    const s = this.sampler?.()
    if (s) {
      this.phase = s.phase
      this.level = s.level
    }
    const step = Math.floor(this.phase * STEPS) % STEPS

    // Beam passing a lit node is what makes it flare — the visual and the
    // audible hit come from the same clock, so they land together.
    if (step !== this.lastStep) {
      this.lastStep = step
      for (let t = 0; t < this.nodes.length; t++) {
        const node = this.nodes[t][step]
        if (node.lit) node.energy = 1
      }
    }

    this.modeMix += ((this.mode === 'projection' ? 1 : 0) - this.modeMix) * Math.min(dt * 3, 1)
    const heroness = 1 - this.modeMix

    for (let t = 0; t < this.nodes.length; t++) {
      for (let s = 0; s < STEPS; s++) {
        const node = this.nodes[t][s]
        node.energy = Math.max(0, node.energy - dt * 2.6)
        const e = node.energy * node.energy // sharper decay, reads as a strike

        const mat = node.mesh.material as MeshBasicMaterial
        mat.opacity = (node.lit ? 0.72 + e * 0.28 : 0.1) * (0.13 + heroness * 0.87)

        const scale = (node.lit ? 1 : 0.62) + e * 0.9 + (node.lit ? Math.min(node.weight, 3) * 0.11 : 0)
        node.mesh.scale.setScalar(scale)
        // Lit steps stand proud of the ring plane; struck ones jump.
        node.mesh.position.z = node.base.z + (node.lit ? 0.05 : 0) + e * 0.2
        node.glow.position.z = node.mesh.position.z

        const gmat = node.glow.material as SpriteMaterial
        gmat.opacity = (node.lit ? 0.3 + e * 0.7 : 0) * (0.12 + heroness * 0.88)
        node.glow.scale.setScalar(0.55 + e * 0.8)
      }
      const rmat = this.rings[t].material as MeshBasicMaterial
      rmat.opacity = 0.22 * (0.12 + heroness * 0.88)
    }

    const pivot = (this as any).beamPivot as Group
    pivot.rotation.z = -this.phase * Math.PI * 2
    ;(this.beam.material as MeshBasicMaterial).opacity = 0.15 + heroness * 0.85

    const pulse = this.nodes.reduce((a, row) => a + (row[this.lastStep]?.energy ?? 0), 0) / 4
    this.core.scale.setScalar(1 + pulse * 0.5)
    ;(this.core.material as MeshBasicMaterial).opacity = (0.55 + pulse * 0.45) * heroness
    this.coreGlow.scale.setScalar(1.35 + pulse * 1.1)
    ;(this.coreGlow.material as SpriteMaterial).opacity = (0.3 + pulse * 0.5) * heroness

    if (!this.reduced) {
      this.spin += dt * 0.055
      this.pointer.x += (this.target.x - this.pointer.x) * Math.min(dt * 2.4, 1)
      this.pointer.y += (this.target.y - this.pointer.y) * Math.min(dt * 2.4, 1)
    }
    this.disc.rotation.z = this.spin + this.pointer.x * 0.12
    this.disc.rotation.x = -0.62 + this.pointer.y * 0.14 + this.modeMix * -0.25
    this.disc.position.z = this.modeMix * -3.8
    this.disc.scale.setScalar(1 - this.modeMix * 0.1)
    this.dust.rotation.y = this.spin * 0.4
    this.dust.rotation.z = this.pointer.x * 0.05

    // Projection: screen fades up, lamps breathe on the real signal.
    const smat = this.screen.material as MeshBasicMaterial
    smat.opacity = this.modeMix
    // Once the fade is done the screen becomes a genuinely opaque object so it
    // renders in the opaque pass and hides the rings behind it. While it is
    // fading it has to stay in the transparent pass to blend at all.
    const settled = this.modeMix > 0.985
    if (smat.transparent === settled) {
      smat.transparent = !settled
      smat.needsUpdate = true
    }
    this.screen.visible = this.modeMix > 0.01
    this.screen.position.y = (1 - this.modeMix) * -0.25
    if (this.screenTex) this.screenTex.needsUpdate = true

    for (let i = 0; i < this.lamps.length; i++) {
      const lm = this.lamps[i].material as SpriteMaterial
      const wobble = 0.5 + 0.5 * Math.sin(this.spin * 6 + i * 1.7)
      lm.opacity = this.modeMix * (0.1 + this.level * 0.7 * wobble)
      this.lamps[i].scale.setScalar(3.4 + this.level * 2.4 * wobble)
    }

    this.camera.position.x += (this.pointer.x * 0.5 - this.camera.position.x) * Math.min(dt * 2, 1)
    this.camera.position.y += (0.1 + this.pointer.y * 0.35 - this.camera.position.y) * Math.min(dt * 2, 1)
    this.camera.lookAt(0, 0, 0)
  }
}

// ------------------------------------------------------------------ textures

function radialTexture(): Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.42)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function beamTexture(): Texture {
  const w = 32
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  // Bright at the hub, gone by the rim — light falling off with distance.
  const g = ctx.createLinearGradient(0, h, 0, 0)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,246,236,0.62)')
  g.addColorStop(0.55, 'rgba(255,232,208,0.26)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Soften the edges across the width.
  const side = ctx.createLinearGradient(0, 0, w, 0)
  side.addColorStop(0, 'rgba(0,0,0,1)')
  side.addColorStop(0.5, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = side
  ctx.fillRect(0, 0, w, h)
  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}
