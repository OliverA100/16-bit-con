# 16-Bit Con

A landing page for 16-Bit Con, a fictional retro tech convention (Oct 3–5, 2026, Javits Center, New York), built on Vega's 16-bit pixel-art brand. Vega design-engineer take-home.

**Live:** https://16-bit-con-seven.vercel.app

## The idea: Sam escapes to the con

The page is one continuous, scroll-driven pixel-art world built from Vega's own backgrounds, playing on a late-80s monitor.

1. **The opening.** A yellow all-in-one monitor, built in code with three.js, powers on with the game live on its screen. PRESS START sits on the screen, and the monitor turns toward the mouse.
2. **The dive.** Scrolling, or PRESS START, zooms the camera into the screen until one game pixel covers a whole number of device pixels, so the 3D hands over to the 2D canvas without a visible change.
3. **The run.** Scroll position is the time of day. Sam runs from the morning field (the keynote), through the afternoon streets (the panel) and the night with its windows lighting one by one (the after party), to dawn over the Javits plaza.
4. **The breakout.** The camera pulls back out to the monitor. Six hits crack its glass, Sam jumps through as it bursts, and he lands on the registration form.

One timeline drives everything, so scrolling up plays it all backwards.

## Controls

- Scroll, or hold → to run and Space to jump. At the monitor's glass, Space or a tap hits it, or wait a second.
- On phones, the d-pad and the A button drive the world.
- With reduced motion, the page is static with the monitor powered on. Without WebGL, the opening is a poster and the canvas world still runs.

## Stack

- Astro 7 with static output, TypeScript in strict mode, and plain CSS; every brand colour is a token in `src/styles/tokens.css`
- GSAP ScrollTrigger pins the world and drives the timeline
- Canvas 2D for the world at an integer pixel scale; the night's recoloured art is built in a Web Worker, so scrolling never stalls
- three.js 0.187 for the monitor and the breakout, loaded after the page and only when WebGL 2 is available

## Run it

Requires Node 22.23 or later.

```bash
npm install
npm run dev       # local dev server
npm run build     # static site in dist/
npm run preview   # serve the build
npm run check     # type-check
```

## Where things are

| Path | What |
|---|---|
| `src/pages/index.astro` | The page: the world, the registration form and the schedule |
| `src/components/` | Window, Button, Folder, Document, Nav, SessionCard, RegisterForm, Wordmark, World |
| `src/game/` | The canvas world: timeline, stages, Sam, input, night palettes and their worker, the plaza and the landing |
| `src/monitor/` | The three.js monitor: model, CRT shader, poster and breakout |
| `src/data/` | Layer recipes, the sprite manifest, sessions, the progress rail and Agent Sam's lines |
| `src/pages/dev/` | Review pages for sprites, wordmark, monitor, UI and buttons, not linked from the page |
| `public/sprites/` | Vega's art, untouched; `SOURCES.md` lists where each file comes from and the new art drawn for this page |

## Performance and accessibility

- The `h1` is the largest contentful paint; the world's art and the 3D load after it.
- Measured during the build: 60 fps through the zoom and the breakout with the CPU throttled 4×, no long tasks or layout shifts, and Lighthouse 100 on mobile and desktop.
- Semantic HTML with real buttons and links, a skip link past the game, visible focus states in brand colours, and Agent Sam's lines announced through a polite live region.

## Assets and licences

- Sprites and logos are Vega's, from vega.io and its careers game. New pixel art drawn for this page is listed under NEW in `public/sprites/SOURCES.md`.
- Geist and Geist Mono: SIL Open Font License.
- PP Mondwest: Pangram Pangram, free for personal use.
- Signifier: a Klim Type Foundry test font, for internal and pitch use only. Replace it with a licensed copy before any public launch.
