# 16-Bit Con

A landing page for 16-Bit Con, a fictional retro tech convention (Oct 3–5, 2026, Javits Center, New York), built on Vega's 16-bit pixel-art brand. Vega design-engineer take-home.

**Live:** https://16-bit-con-seven.vercel.app

## The idea: Sam escapes to the con

By default the page reads like a normal landing page: the hero, the registration form, the schedule and the footer, scrolling as usual. The hero is a late-80s monitor with a pixel-art game live on its screen, built from Vega's own backgrounds. The game is opt-in and starts only from START.

1. **The opening.** A yellow all-in-one monitor, built in code with three.js, powers on with the game live on its screen. START sits on the screen, and the monitor turns toward the mouse.
2. **The dive.** START pins the page and zooms the camera into the screen until one game pixel covers a whole number of device pixels, so the 3D hands over to the 2D canvas without a visible change.
3. **The flyer.** A flyer floats down from the sky like a sheet of paper, swinging from side to side and lying flat on the air. Sam watches it land, walks over and picks it up, and it opens over the game: 16-Bit Con, Oct 3–5, Javits Center, free entry.
4. **The journey.** No car and no ticket, so Sam runs to New York, and scroll position is the time of day: the morning field, the afternoon city with a glass box far down the avenue, sunset, the night with its windows lighting one by one, and sunrise at the Javits plaza. He says what he sees and thinks in a small window as he goes.
5. **The twist.** At the Javits he notices it is all pixels: he is still inside the game, and the real 16-Bit Con is out there. He decides to break out.
6. **The breakout.** The camera pulls back out to the monitor. Six hits crack its glass and a seventh breaks it: Sam jumps out through it as it bursts, and the page follows him down onto the registration form. The hero keeps its layout throughout.

Inside the game one timeline drives everything, so scrolling up plays it backwards, and Sam says a line again when he passes it once more. When Sam lands, the game closes itself: the pin goes, the page stays exactly where it was, and Sam stays on the form for the rest of the visit. Exit game (or Esc) leaves mid-game, zooming back out to the monitor with focus on START. The flyer falls once per visit: START after Exit resumes where Sam was. The schedule lives on the page, not in the game.

## The schedule

The schedule is a drawer of Vega's tabbed folders, one day at a time: index tabs across the top pick Oct 3, 4 or 5, and the day's three folders stand in the drawer, every tab showing its time and title. One folder is always open (the Opening Keynote to start): it lifts out of the drawer to show its details and its own animated scene, drawn on a canvas from Vega's sprites at one CSS pixel per art pixel, beside and below the text. Only the open folder's scene plays, and only while it is on screen; every scene is built ahead of time in idle moments, so opening a folder or switching day starts at once and moves on the site's 16-bit beat, a step every 50 ms, which any click can redirect midway.

The brief's three sessions are Oct 3, with their copy as given. The Oct 4 and Oct 5 sessions were added for this page.

## Controls

- START opens the game. Until then the keys belong to the page, so Space scrolls it.
- From START until the flyer has been read, nothing moves the run: the page and the run keys are held (Esc and Exit game still work). "Let's go" or Esc closes the flyer.
- In the game, scroll, or hold → to run and Space to jump. Sam gets to full speed and stops in about a tenth of a second, a held Space jumps higher than a tap, and a jump pressed just before landing still counts. A hint under the HUD says how for the device: "← → or scroll to run · Space to jump", or on touch screens "Hold ◀ ▶ or swipe to run · Tap A to jump". The run can be scrolled as fast as you like; the breakout can't be skipped. Past the plaza the scroll pulls the camera back out to the monitor at the dive's pace and stops at the glass. A click or a tap on the monitor ("Help Sam · Hit the screen"), or Space, cracks it at once. Scrolling cracks it too, at most a crack every 150 ms, but only a scroll of the player's: a new swipe or wheel turn, never the momentum that carried the page there. On touch screens a new touch at the glass makes the next swipe count. It never cracks by itself. Six hits crack it and the seventh starts the finale: the glass bursts, Sam leaps out and the page follows him down onto the form, at its own pace with scrolling held.
- On phones, the d-pad and the A button drive the world.
- Skip, top right in the game, jumps to the Javits at sunrise, just before the twist, behind a short stepped fade. The twist always plays: lines Sam has run well past are dropped so his window keeps up with him, but the twist's two lines are never dropped, and the run's end waits for them for a few seconds at most.
- Exit game in the HUD, or Esc, closes the game: the camera zooms back out of the screen to the monitor, which then shows the game frozen where you left it. START dives back in and resumes from that spot (in memory only, so a reload starts over).
- The game has sound: a whoosh and an electric buzz as the camera dives in and zooms out; the flyer's paper fluttering at each swing, a tap as it lands, a crinkle as Sam picks it up and a rustle as it opens and folds; a crack per stage, the glass breaking, the broken tube's static, and the monitor's power button switching it off and on. Nothing plays before START, except the power button when the visitor presses it. The speaker button next to Exit game turns it off, and the browser remembers that. The sound is silent while the tab is hidden, and opening the registration dialog ends whatever is playing.
- "Register now" brings the registration form into view under the nav, centred there when it fits; in the game it opens the form in a dialog over the paused game, which scrolls on under Safari's toolbar on phones like the page does, and Esc, its close square or a click outside closes only the dialog.
- The form asks for a player name, an email and a pass (one day or all three), with an optional news checkbox. Errors are checked when you leave a field and on submit, and show under the field without moving anything. Registering turns the window into a ticket for the pass, with a code and a barcode drawn from it, and an Add to calendar button that downloads an .ics for its dates. Nothing is sent or stored.
- After Sam lands, the hero is as it was on load, with the glass broken and no Start button. There is no replay.
- With reduced motion, the page is static with the monitor powered on and no START: the game is never offered. Without WebGL, the opening is a poster and START still runs the canvas world.

## Stack

- Astro 7 with static output, TypeScript in strict mode, and plain CSS; every brand colour is a token in `src/styles/tokens.css`
- A custom 16-Bit Con wordmark, drawn in the construction of Vega's own (slant, stem and bar weights, corners and daisy), inlined as SVG in `Wordmark.astro` in the page's Green 900 ink
- GSAP ScrollTrigger pins the world and drives the timeline
- Canvas 2D for the world at an integer pixel scale; the night's recoloured art is built in a Web Worker, so scrolling never stalls
- three.js 0.187 for the monitor and the breakout, loaded after the page and only when WebGL 2 is available
- Web Audio for the sound: the dive, the zoom out and the static are synthesised in code; the cracks and the shatter are short recordings (about 50 KB), fetched only once the game starts

## Run it

Requires Node 22.23 or later.

```bash
npm install
npm run dev       # local dev server
npm run build     # static site in dist/
npm run preview   # serve the build
npm run check     # type-check
npm run icons     # favicon.svg, favicon.ico, apple-touch-icon.png from the wordmark's "16" (needs Google Chrome)
npm run og        # og.png, the social image (needs Google Chrome)
```

Under `npm run dev`, `/dev/sound` plays each sound, picks the crack sounds and sets their order stage by stage, and has sliders for its numbers. It is never part of the build.

## Where things are

| Path | What |
|---|---|
| `src/pages/index.astro` | The page: the world, the registration form and the schedule |
| `src/components/` | Window, Button, Nav, SectionHeader, ScheduleDrawer, RegisterForm, Ticket, Wordmark, World, FlyerDialog |
| `src/register/` | The registration form's checks, its success state, the ticket and its cast, and the calendar file |
| `src/ui/` | The focus brackets |
| `src/schedule/` | The schedule drawer's behaviour, the scene runner and the nine folder scenes |
| `src/game/` | The canvas world: timeline, stages, Sam, input, night palettes and their worker, the plaza and the landing; the falling flyer and its dialog (`flyer.ts`, `flyer-art.ts`, `flyer-dialog.ts`); the signs and posters (`signage.ts`, from the wordmark's own paths); `sound.ts` for the game's sound |
| `src/monitor/` | The three.js monitor: model, CRT shader, poster and breakout |
| `src/data/` | World keyframes, the sprite manifest, sessions, Sam's lines (`guide.ts`), the wordmark's paths and the pixel icons |
| `public/sounds/` | The crack and shatter recordings, used as they are |
| `src/dev/` | The sound tuning page (dev only) |
| `public/sprites/` | Vega's art, untouched; `SOURCES.md` lists where each file comes from and the new art drawn for this page |

## Performance and accessibility

- The opening paints in one go with no image request: the wordmark is inline SVG, so the largest contentful paint is the hero's text (its tagline), and the world's art and the 3D load after it.
- Measured during the build: 60 fps through the zoom and the breakout with the CPU throttled 4×, no long tasks or layout shifts, and Lighthouse 100 on mobile and desktop.
- All the event information lives in the DOM sections and is reachable without playing; the canvases are `aria-hidden`. Closed schedule folders use `hidden="until-found"`, so find-in-page reaches their text and opens the folder; each tab is a button with `aria-expanded` whose name starts with its visible label. By default nothing in the game (HUD, Skip, d-pad, Exit game) is in the tab order.
- The pin is created only when the game starts and removed when it ends, with the scroll adjusted in the same frame, so neither adds a layout shift.
- Semantic HTML with real buttons and links, and one visible focus state everywhere: pixel corner brackets in Green 900 round whatever has keyboard focus. The registration dialog and the flyer are native modal `<dialog>`s that trap focus; the registration dialog returns it to the link that opened it. Starting, closing and finishing the game are announced, as are Sam's lines, through polite live regions.

## Assets and licences

- Sprites and logos are Vega's, from vega.io and its careers game. New pixel art drawn for this page is listed under NEW in `public/sprites/SOURCES.md`.
- The 16-Bit Con wordmark is custom, drawn for this page after Vega's wordmark.
- Geist and Geist Mono: SIL Open Font License.
- PP Mondwest: Pangram Pangram, free for personal use.
- Signifier: a Klim Type Foundry test font, for internal and pitch use only. Replace it with a licensed copy before any public launch.
