# 16-Bit Con

A landing page for 16-Bit Con, a fictional retro gaming convention (October 3–5, 2026, Javits Center, New York), built on Vega's 16-bit pixel-art brand. My take-home for Vega's design engineer role.

- **Live:** https://16-bit-con-seven.vercel.app
- **Design board (Figma):** https://www.figma.com/design/8f4ysfdYlgBwOVe4y4FDdx/Home-Assignment---Design-Engineer?node-id=37-3

**The Register form is a demo.** Nothing is sent or stored: the pass, its code and the calendar file are made in the browser.

## What it is

By default it is a normal landing page: a hero with the event's name, dates, place and a call to action; a registration section; a schedule; a footer. All the event's information is in the page and readable without playing anything.

The hero is a late-80s monitor, modelled in code, with a pixel-art game live on its screen. Pressing Start is the free section: the camera dives into the screen and scrolling becomes the game. Sam the mole finds a flyer for the con, runs from the field to New York as the day passes, realises at the Javits that he is still inside the game, and breaks out through the glass onto the registration form. After that he lives on the page: he climbs a beanstalk beside the content and ends up in the footer's field.

## Run it

Requires Node 22.23 or later (`.nvmrc` pins 24).

```bash
npm install
npm run dev            # local dev server
npm run build          # static site in dist/
npm run preview        # serve the build
npm run lint           # type-check (astro check, strict)
npm run format:check   # Prettier
npm run icons          # regenerate the favicons (needs Google Chrome)
npm run og             # regenerate the social image (needs Google Chrome)
```

## How it is structured

| Path | What |
|---|---|
| `src/pages/` | The page (`index.astro`) and the 404 |
| `src/layouts/Base.astro` | Head, nav, footer, the skip link |
| `src/components/` | Window, Button, Nav, SectionHeader, RegisterForm, Ticket, ScheduleDrawer, World (the hero and the game's UI), FlyerDialog, Wordmark |
| `src/styles/` | `tokens.css` (every colour, type role, space, line and duration), `global.css`, `fonts.css` |
| `src/game/` | The canvas game and Sam's life on the page after it: timeline, world, input, sound, the flyer, the landing, the journey |
| `src/monitor/` | The three.js monitor: model, CRT shader, breakout |
| `src/schedule/` | The drawer's behaviour, the scene runner and the nine folder scenes |
| `src/register/` | Validation, the success state, the pass, the calendar file |
| `src/lib/` | Shared helpers: small maths, cloud drift, the reduced-motion preference |
| `src/data/` | Sessions, Sam's lines, the sprite manifest, the wordmark's paths, the pixel icons |
| `scripts/` | The favicon and social image builders |
| `public/` | Sprites, fonts, sounds, the monitor's posters |

## Decisions, and why

- **Astro with static output, TypeScript and plain CSS.** The page is content first; the game is an island that loads after it. No UI framework: there is no state a few modules cannot hold.
- **One system in `tokens.css`.** Colour by role, one type scale as named roles, one spacing scale, one frame line, one shadow. Components carry no values of their own.
- **Two motions.** Things that appear step in on a 50 ms beat, like a 16-bit game; things you push (buttons, tabs) glide.
- **The game is optional and scroll-driven.** One timeline maps scroll to the story, so it plays backwards too, works with wheel, keys and touch, and can be skipped or left at any point.
- **Canvas 2D at a whole-number pixel scale.** One art pixel is always a whole number of device pixels, so the 3D monitor can hand over to the 2D world without a visible change.
- **three.js only for the monitor**, loaded after the page and only when WebGL 2 is there. Without it the hero is a poster and the game still runs.
- **Fallbacks are designed, not left over.** Reduced motion gives a still page with no game. Without JavaScript every session is laid out and the form is readable.

### Different on purpose

- Sam's lines are set in Geist Mono, not the pixel face: a spoken line is running text in a window.
- Session titles are in title case (the brief's titles as given) and in bold Geist, as Vega draws its folder cards.
- The flyer is paper, not a window: it has no close square, a soft shadow, and it glides in.
- The touch d-pad and A button are smooth, like hardware; everything else is pixel-drawn.
- Art (the flyer, the world, Sam's portrait) uses the whole palette; the colour roles are for the UI.
- The Schedule's scenes are drawn at one CSS pixel per art pixel; the world and Sam at the device's whole-pixel scale.
- The primary button has no edge (Vega's button), and placeholder text is Grey 500: both are below the usual contrast ratios and both sit beside a label that carries the meaning.

## Accessibility and performance

- Semantic landmarks and heading order, a skip link past the game, visible focus brackets, 44 px touch targets, labelled and described form fields, live regions for Sam's lines and the game's state. The two dialogs are native modal dialogs.
- Checked with axe (no violations on either page or in the dialogs), a keyboard run-through, and a computed-style comparison of every component state.
- The largest paint is text, there is no layout shift, the game's loop rests when it is off screen, and each scene animates only while it is visible. Lighthouse on the live home page: 100 on desktop; 96 performance and 100 accessibility and best practices on mobile.

## What I'd add next

- Automated tests: unit tests for the timeline, the form and the calendar file, and a browser test of the full play-through.
- CI running the type check, the format check and the build on every push.
- Security headers (a content security policy first).
- A real endpoint behind the form.
- The game's main module is still one long file; I would split it further by mode.

## Credits

See [CREDITS.md](CREDITS.md) for the art, fonts and sounds.
