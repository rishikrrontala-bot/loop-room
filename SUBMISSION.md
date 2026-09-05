# Submission cheat sheet

Everything to copy-paste. Fill the two blanks marked **[YOU]** and you're done.

---

## 1. YouTube upload

Go to **https://youtube.com/upload**, drag in `demo/loop-room-demo.webm` (14 MB, 2:10).

**Visibility: Unlisted.** The hackathon explicitly allows it and it keeps the video off your public channel.

### Title
```
Loop Room — four friends make a music video in ten minutes | Code to Connect 2026
```

### Description
```
Loop Room is a collaborative studio that runs entirely in the browser. Four
people join a room with a four-letter code and make one thing together.

Jam — everyone takes an instrument and taps out a two-bar loop on a shared
step sequencer. It's locked to a pentatonic scale, so there's no pad anyone
can press that sounds wrong.

Draw — the loop keeps playing while the group animates to it. Eight frames,
taken in turns, each drawn over a ghost of the last one. Whoever isn't
drawing watches the current artist's ink appear stroke by stroke.

Keep — the animation loops in time with the song, and one button records it
as a real video with the audio. That's what you take home.

The soundtrack on this demo is the loop the demo itself builds.

No audio ever crosses the network. Every browser holds the same grid and the
same start timestamp, learns the server clock offset through an NTP-style
handshake, and renders the identical song locally. Only a timestamp has to be
accurate, so the jam doesn't degrade with distance.

Built in 48 hours for Code to Connect: Women in Tech Hackathon 2026,
Track 1 — Connect Online.

Play it: https://loop-room.onrender.com
Code:    https://github.com/rishikrrontala-bot/loop-room

Built with React, TypeScript, Vite, the Web Audio API, three.js, and ws.
No audio files, no sample packs — every sound is synthesised at runtime.
```

### Tags
```
hackathon, creative coding, web audio api, multiplayer, collaborative music,
three.js, react, typescript, women in tech, generative music
```

---

## 2. Devpost submission

**Project name:** Loop Room

**Tagline (short):**
```
Four friends, one browser tab each. Build a loop together, draw a frame each,
and leave with a music video none of you could have made alone.
```

**Track:** Track 1 — Connect Online

**Built with:** `react` `typescript` `vite` `web-audio-api` `three.js` `websockets` `node.js` `canvas` `webgl` `mediarecorder`

**Try it out links:**
- https://loop-room.onrender.com
- https://github.com/rishikrrontala-bot/loop-room

### Inspiration
We're surrounded by more entertainment than ever and somehow it's easier than
ever to be bored. Almost everything we open is a feed — something made by
someone else, for us to consume alone. We wanted to build the opposite: a
thing with no library, nothing to browse, and nothing to consume. Something
you can't use as well by yourself as you can with friends.

### What it does
Loop Room is a collaborative studio in the browser. Up to four people join a
room with a four-letter code and make one thing together in about ten minutes.
First everyone takes an instrument and builds a two-bar loop on a shared step
sequencer. Then the group animates to it — eight frames, taken in turns, each
drawn over a ghost of the last. Finally the animation loops in time with the
song, and one button exports it as a real video with audio.

### How we built it
React and TypeScript on the front, a small Node WebSocket server for rooms.
Every instrument sound is synthesised at runtime with the Web Audio API —
there are no audio files in the project. The reveal is a three.js scene that
renders the room's loop as a circular sequencer. Video export muxes the canvas
and the audio graph through MediaRecorder.

The decision we're proudest of: no audio ever crosses the network. Every
browser holds the same grid and the same start timestamp, learns the server
clock offset through an NTP-style ping/pong handshake, and renders the
identical song locally. Only a timestamp has to be accurate, which means the
jam doesn't degrade with distance and a dropped packet costs you a pad flash
rather than a beat. We measured it: two clients compute an identical loop
phase for the same instant, and it holds over a real network at 123ms RTT.

### Challenges we ran into
Getting four people to hear the same thing at the same moment without
streaming audio. Also: with all four tracks busy the master bus was clipping
at 1.10 peak amplitude, which sounds like distortion rather than like loud —
we added a limiter and brought it to 0.83.

### Accomplishments that we're proud of
It sounds good even when nobody in the room can play an instrument, because
the grid is locked to one scale. Nobody can ruin it, so nobody is afraid to
touch it.

### What we learned
That constraints are what make a collaborative toy safe to use. The
pentatonic lock and the turn-based frames aren't limitations — they're the
reason four strangers will actually press the buttons.

### What's next for Loop Room
Rooms that persist so a loop can be picked up the next day, and more than four
players by letting people share an instrument.

### What we changed  ← **[YOU]** required, and it is scored
Three sentences: one piece of feedback you got this weekend, what you changed
because of it, and why. Be specific — "a mentor pointed out X, so we changed
Y" beats "great feedback, validated our approach". Deciding *against* feedback
scores fine if you can say why.

---

## 3. Checklist

- [ ] Devpost submission with team name, all members, and the track
- [ ] Public GitHub repo — **done**: https://github.com/rishikrrontala-bot/loop-room
- [ ] README with features, setup, tech stack, credits, AI usage — **done**
- [ ] Demo video 2–3 min — **done**: `demo/loop-room-demo.webm` (2:10), needs uploading
- [ ] "What we changed" paragraph — **[YOU]**
- [ ] Saturday mentor check-in logged in #mentor-checkins on Discord — **[YOU]**
