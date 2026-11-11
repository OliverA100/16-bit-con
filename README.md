# 16-Bit Con

A landing page for 16-Bit Con, a fictional retro tech convention (Oct 3–5, 2026, Javits Center, New York), built on Vega's 16-bit pixel-art brand. Vega design-engineer take-home.

**Live:** https://16-bit-con-seven.vercel.app

## The idea: Sam escapes to the con

By default the page reads like a normal landing page: the hero, the registration form, the schedule and the footer, scrolling as usual. The hero is a late-80s monitor with a pixel-art game live on its screen, built from Vega's own backgrounds. The game is opt-in and starts only from START.

1. **The opening.** A yellow all-in-one monitor, built in code with three.js, powers on with the game live on its screen. START sits on the screen, and the monitor turns toward the mouse.
2. **The dive.** START pins the page and zooms the camera into the screen until one game pixel covers a whole number of device pixels, so the 3D hands over to the 2D canvas without a visible change.
3. **The run.** In the game, scroll position is the time of day. Sam runs from the morning field (the keynote), through the afternoon streets (the panel) and the night with its windows lighting one by one (the after party), to dawn over the Javits plaza.
4. **The breakout.** The camera pulls back out to the monitor. Six hits crack its glass and a seventh breaks it: Sam jumps out through it as it bursts, and the page follows him down onto the registration form. The hero keeps its layout throughout.

Inside the game one timeline drives everything, so scrolling up plays it backwards. When Sam lands, the game closes itself: the pin goes, the page stays exactly where it was, and Sam stays on the form for the rest of the visit. Exit game (or Esc) leaves mid-game, zooming back out to the monitor with focus on START.

## The schedule

The schedule is a drawer of Vega's tabbed folders, one day at a time: index tabs across the top pick Oct 3, 4 or 5, and the day's three folders stand in the drawer, every tab showing its time and title. One folder is always open (the Opening Keynote to start): it lifts out of the drawer to show its details and its own animated scene, drawn on a canvas from Vega's sprites at one CSS pixel per art pixel, beside and below the text. Only the open folder's scene plays, and only while it is on screen; every scene is built ahead of time in idle moments, so opening a folder or switching day is one smooth motion that any click can redirect midway.

The brief's three sessions are Oct 3, with their copy as given. The Oct 4 and Oct 5 sessions were added for this page.

## Controls

- START opens the game. Until then the keys belong to the page, so Space scrolls it.
- In the game, scroll, or hold → to run and Space to jump. The run can be scrolled as fast as you like; the breakout can't be skipped. Past the plaza the scroll pulls the camera back out to the monitor at the dive's pace and stops at the glass. A click or a tap on the monitor ("Help Sam · Hit the screen"), or Space, cracks it at once. Scrolling cracks it too, at most a crack every 150 ms, but only a scroll of the player's: a new swipe or wheel turn, never the momentum that carried the page there. On touch screens a new touch at the glass makes the next swipe count. It never cracks by itself. Six hits crack it and the seventh starts the finale: the glass bursts, Sam leaps out and the page follows him down onto the form, at its own pace with scrolling held.
- On phones, the d-pad and the A button drive the world.
- Exit game in the HUD, or Esc, closes the game: the camera zooms back out of the screen to the monitor, which then shows the game frozen where you left it. START dives back in and resumes from that spot (in memory only, so a reload starts over). The skip link closes the game at once.
- "Register now" centres the registration form on the page; in the game it opens the form in a dialog over the paused game, and Esc or its close button closes only the dialog.
- After Sam lands, the hero is as it was on load, with the glass broken and no Start button. There is no replay.
- With reduced motion, the page is static with the monitor powered on and no START: the game is never offered. Without WebGL, the opening is a poster and START still runs the canvas world.

## Stack

- Astro 7 with static output, TypeScript in strict mode, and plain CSS; every brand colour is a token in `src/styles/tokens.css`
- A custom 16-Bit Con wordmark, drawn in the construction of Vega's own (slant, stem and bar weights, corners and daisy), inlined as SVG in `Wordmark.astro` in the page's Green 900 ink
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
| `src/components/` | Window, Button, Nav, ScheduleDrawer, RegisterForm, Wordmark, World |
| `src/schedule/` | The schedule drawer's behaviour, the scene runner and the nine folder scenes |
| `src/game/` | The canvas world: timeline, stages, Sam, input, night palettes and their worker, the plaza and the landing |
| `src/monitor/` | The three.js monitor: model, CRT shader, poster and breakout |
| `src/data/` | World keyframes, the sprite manifest, sessions, the progress rail and Agent Sam's lines |
| `public/sprites/` | Vega's art, untouched; `SOURCES.md` lists where each file comes from and the new art drawn for this page |

## Performance and accessibility

- The opening paints in one go with no image request: the wordmark is inline SVG, so the largest contentful paint is the hero's text (its tagline), and the world's art and the 3D load after it.
- Measured during the build: 60 fps through the zoom and the breakout with the CPU throttled 4×, no long tasks or layout shifts, and Lighthouse 100 on mobile and desktop.
- All the event information lives in the DOM sections and is reachable without playing; the canvases are `aria-hidden`. Closed schedule folders use `hidden="until-found"`, so find-in-page reaches their text and opens the folder; each tab is a button with `aria-expanded` whose name starts with its visible label. By default nothing in the game (HUD, rail, d-pad, Exit game) is in the tab order.
- The pin is created only when the game starts and removed when it ends, with the scroll adjusted in the same frame, so neither adds a layout shift.
- Semantic HTML with real buttons and links, visible focus states in brand colours, and a skip link that also leaves the game. The registration dialog is a native modal `<dialog>` that traps focus and returns it to the link that opened it. Starting, closing and finishing the game are announced, as are Agent Sam's lines, through polite live regions.

## Assets and licences

- Sprites and logos are Vega's, from vega.io and its careers game. New pixel art drawn for this page is listed under NEW in `public/sprites/SOURCES.md`.
- The 16-Bit Con wordmark is custom, drawn for this page after Vega's wordmark.
- Geist and Geist Mono: SIL Open Font License.
- PP Mondwest: Pangram Pangram, free for personal use.
- Signifier: a Klim Type Foundry test font, for internal and pitch use only. Replace it with a licensed copy before any public launch.
