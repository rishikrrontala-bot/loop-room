# Loop Room

**Four friends, one browser tab each. Build a loop together, draw a frame each, and leave with a music video none of you could have made alone.**

Built for **Code to Connect: Women in Tech Hackathon 2026** — Track 1, *Connect Online*.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rishikrrontala-bot/loop-room)

---

## What it does

Loop Room is a tiny collaborative studio that runs entirely in the browser. A group of up to four people join a room with a four-letter code and make one thing together in about ten minutes.

It runs in three stages:

**1. Jam.** Everyone gets an instrument — drums, bass, chords, or melody — and taps out a two-bar loop on a step grid. The whole grid is locked to the C major pentatonic scale, so there is no pad anyone can press that sounds wrong. That's the point: nobody needs to be a musician, and nobody can ruin it.

**2. Draw.** The loop keeps playing while the group animates to it. Eight frames, taken in turns, each drawn over a faint ghost of the previous frame. Whoever isn't drawing watches the current artist's ink appear stroke by stroke in real time.

**3. Keep.** The animation loops in time with the song inside a 3D room lit by four coloured lamps that pulse to the actual audio signal. One button records exactly two loops and hands you a `.webm` with sound, ready to post.

### Why this answers the track

The brief asks how to make digital entertainment more joyful, engaging and intentional — how to turn people from passive consumers into active participants. Loop Room has no feed, no library and nothing to browse. There is nothing to consume in it at all. You cannot use it alone as well as you can use it with friends, and the only thing you take away is something the group made in the last ten minutes.

---

## Key features

- **Real-time multiplayer** over WebSocket — rooms, join codes, shareable invite links, live player roster
- **Sample-accurate shared timing** so everyone hears the identical song at the identical moment (see below)
- **Instrument ownership** — you edit your own track; the server enforces it, not just the UI
- **Four synthesised instruments** built from oscillators and noise, with a procedural reverb and a safety limiter — no audio files, no samples, no CDN
- **"Surprise me"** generates a musically sensible pattern per instrument, so nobody stares at an empty grid
- **Turn-based animation** with onion-skinning and a filmstrip that highlights the frame the music is currently on
- **Live stroke streaming** so waiting your turn means watching, not idling
- **Video export** — canvas + audio muxed via `MediaRecorder`, cut to exactly two loops so the file loops seamlessly
- **WebGL scene** that visualises the room's actual loop as a circular sequencer, with a full CSS fallback if WebGL is unavailable
- **Runs on a phone**, joins over local wifi, and reconnects itself when a laptop sleeps

---

## The interesting bit: how everyone stays in time

The naive way to build this is to have one machine play the audio and stream it to everyone else. That falls apart the moment the network hiccups, and it sounds worse the further away you are.

Loop Room never sends audio anywhere. Instead:

- Every browser holds the same 4×16 grid and the same `startedAt` timestamp.
- On connect, each client runs a small NTP-style handshake with the server — ping, pong, keep the sample with the smallest round trip — and learns the offset between its own `Date.now()` and the server's.
- Each client then renders the identical song locally, scheduling notes against the shared timeline using the standard Web Audio lookahead pattern: a coarse `setInterval` decides *what* to play, and the audio thread's own sample clock decides exactly *when*.

The result is that the only thing which has to be accurate across the network is a timestamp, and only a few hundred bytes ever move when someone taps a pad. The jam does not degrade with distance, and a dropped packet costs you a pad flash rather than a beat.

The same clock drives the visuals. The playhead, the beat-synced filmstrip, and the sweeping beam in the 3D scene all read the same loop phase the audio does — which is why the light hitting a node and the sound of that node land together.

---

## Run it

Requires Node 18 or newer.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Click **Start a room**, then share the invite link (the room code button copies it) or read the four-letter code out loud.

To play with people in the same room, they can join over local wifi — the dev server binds to your network interface, so `http://<your-ip>:5173` works from a phone on the same network.

**Useful flags**

- `?mute=1` — start silent. Good for screenshots, or joining from a lecture theatre.
- `?r=CODE` — prefills a room code. This is what the copied invite link uses.

**Production build**

```bash
npm run build
npm start
```

`npm start` serves the built app *and* the WebSocket from a single Node process on `$PORT`, so it deploys as one service with no extra configuration.

### Deploying

This needs a **web service**, not static hosting. The multiplayer runs over a WebSocket, so Netlify, GitHub Pages and Vercel's static output won't work — the page would load and the room would never connect.

A `render.yaml` blueprint is committed, so the button above is the whole deploy: it reads the blueprint, builds, and starts the service. Render's free tier supports WebSockets.

Two things worth knowing about the free tier:

- **It sleeps after 15 minutes of inactivity** and takes 30–60 seconds to wake. Open the link a minute before you demo.
- **Rooms live in memory**, so a sleep clears them. Start a fresh room when you wake it.

---

## Tech stack

| | |
|---|---|
| **Frontend** | React 18, TypeScript, Vite 6 |
| **Realtime** | `ws` (WebSocket), plain in-memory room state on Node |
| **Audio** | Web Audio API — hand-built synth voices, convolution reverb, dynamics limiter |
| **3D** | three.js (`WebGLRenderer`, no post-processing) |
| **Drawing** | Canvas 2D, Pointer Events |
| **Video** | `MediaRecorder` + `canvas.captureStream()` + `MediaStreamAudioDestinationNode` |
| **Motion** | View Transitions API, CSS 3D transforms, CSS custom properties driven from the loop clock |
| **Styling** | Hand-written CSS. No framework, no utility library. |

Everything is client-rendered and dependency-light: the whole runtime is React, three.js and `ws`.

---

## Credits

**Libraries**
- [React](https://react.dev) — MIT
- [Vite](https://vite.dev) — MIT
- [TypeScript](https://www.typescriptlang.org) — Apache-2.0
- [three.js](https://threejs.org) — MIT
- [ws](https://github.com/websockets/ws) — MIT
- [concurrently](https://github.com/open-cli-tools/concurrently) — MIT

**Fonts** — all SIL Open Font License, downloaded from Google Fonts and self-hosted in `public/fonts` so the app doesn't depend on the venue wifi:
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) by Florian Karsten
- [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) by Rodrigo Fuenzalida
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) by JetBrains

**Technique**
- The audio scheduler follows the lookahead pattern from Chris Wilson's [*A Tale of Two Clocks*](https://web.dev/articles/audio-scheduling) (HTML5 Rocks / web.dev).

**Not used:** no UI kit, no component library, no CSS framework, no icon pack, no sample packs, no stock assets, no datasets, no pre-trained models, no starter template.

**Made by us:** every instrument sound is synthesised at runtime from oscillators and generated noise buffers — there are no audio files in this repo. The reverb impulse response is generated procedurally. All icons are hand-authored SVG. All copy, colour, layout and the 3D scene are original to this project.

---

## AI usage

This project was built in a pair-programming session with **Claude (Claude Code)**. Being specific, since the rules ask:

- **Architecture and implementation** — Claude wrote the majority of the application code across the session: the WebSocket room server, the clock-sync handshake, the Web Audio synth voices and scheduler, the React stages, the three.js scene, and the CSS.
- **Direction and decisions** — the concept, the track choice, and the visual direction were chosen by the team from options Claude proposed. Claude was asked to justify trade-offs (for example: local playback against a shared clock rather than streaming audio) and those calls were reviewed before being implemented.
- **Debugging and verification** — Claude drove a headless browser to test its own work, which is how several real bugs were found and fixed: the master bus was clipping at 1.10 peak amplitude with four busy tracks (fixed with a limiter, now 0.83), the reveal's canvas texture was rendering washed out because it wasn't tagged sRGB, the room server was racing Vite for a port, and the server was accepting edits to instruments the sender didn't own.
- **Not used for:** any assets. There is no generated art, audio, or copy-from-a-model in the product itself — the sounds are synthesised, the icons are drawn, and the interface text was written for this app.

Design review was run through the `impeccable` design skill, which flagged and led to fixes for contrast (`--ink-faint` was failing WCAG AA at 3.7:1, now 5.9:1), gradient text in the wordmark, and eyebrow labels above headings.

---

## Known limits

- **Four players per room.** A fifth person can join and watch, but there are only four instruments.
- **Rooms are in memory.** Restarting the server clears them, and empty rooms are reaped after 30 minutes. There is no database, by choice — nothing here is worth persisting beyond the session, and the video export is the artefact you keep.
- **Recording needs `MediaRecorder`.** Chrome and Firefox produce WebM; Safari produces MP4. If neither is available the app says so and suggests screen recording instead.
- **Video capture pauses in a background tab**, because the animation is driven by `requestAnimationFrame`. Recording is a deliberate, watched action, so this hasn't been a problem in practice.
- **Sixteen steps on a 375px phone** gives roughly 20px pads. Usable, and drag-to-paint helps, but a laptop is the better instrument.

---

## Project layout

```
server/index.js        Room server: state, broadcast, clock replies, ownership rules
src/audio.ts           Synth voices, reverb, limiter, lookahead scheduler
src/net.ts             WebSocket client and the NTP-style clock sync
src/config.ts          Scale, instruments, palette — the musical constants
src/three/LoopScene.ts The WebGL scene: circular sequencer and projection room
src/stages/            Landing, Jam, Draw, Reveal
src/components/        Top bar, 3D canvas host, icon set
src/styles.css         The whole design system
```
