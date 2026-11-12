# Credits

What this site ships, and where each part comes from.

## Vega's art

The sprites, backgrounds, logos and UI frames in `public/sprites/` are Vega's own, taken from vega.io and its careers game. The assignment asks to build on Vega's brand assets. The files are used as they are; anything the site changes, it changes at load, in code:

- **Sam** (`sam/`): the run, jump, idle, climb and smoking sheets (60 × 60 frames) and his portrait. Four of them have green goggles in the files; the brand's are blue, so `src/game/palette.ts` swaps the goggle and body colours at load and every sheet matches.
- **The world** (`world/`): Vega's hills, city layers, clouds, the grass-over-rock and desert ground strips, the daisy and beanstalk sheets, and the night scene the Schedule's Cheat Codes folder samples.
- **Props, people and the office** (`props/`, `npc/`, `office/`): the arcade machine, the street's furniture, the moles of the background crowd, the dog, and the careers game's office for the Schedule's scenes.
- **Logos and UI** (`ui/`): the Vega logo and daisy, and the coin.

## Drawn for this page

In `public/sprites/new/`:

- `javits-facade_1408x680.png`: the Javits Center for the arrival, stepped glass cubes seen front-on.
- `javits-far_176x85.png`: the same facade far down the avenue, at 1:8.
- `javits-doors_270x67.png`: the entrance, made from Vega's careers entrance doors, halved.
- `cypress_12x40.png`: a clipped tree for the row along the Javits base.
- `pixel-letters_5x7.png`: a 5 × 7 letter set in the style of Vega's yellow sign tiles.

Drawn in code, with no file: the 16-Bit Con wordmark (after the construction of Vega's own), the flyer, the signs and posters, the pass and its barcode, the pixel icons, and the monitor (`src/monitor/`). The two monitor posters in `public/monitor/` are renders of that model.

## Fonts

- **Signifier** and **PP Mondwest** are Vega's brand typefaces, taken from the brand file provided with the assignment and used here only for this submission.
- **Geist** and **Geist Mono**: SIL Open Font License 1.1.

## Sound

- The five recordings in `public/sounds/` (`crack-3`, `crack-4`, `glass-1`, `glass-3`, `shatter`) were generated with ElevenLabs sound effects, then trimmed and levelled.
- Every other sound (the dive, the zoom out, the static, the flyer's paper, the power button) is synthesised in the browser by `src/game/sound.ts`.

## Libraries

Astro, three.js and GSAP ScrollTrigger, under their own licences (see `package.json`).
