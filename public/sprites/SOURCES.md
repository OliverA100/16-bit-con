# Sprite sources

All files in this folder except those marked NEW were pulled from vega.io on 2026-11-07
(homepage CDN at vegasecurity.directus.app, the careers-game pack at /assets/sprites/,
and CMS images used across marketing pages). Vega's take-home brief asks to build on
their brand assets; this file keeps the provenance honest.

Grid: every Sam animation sheet is a horizontal strip of 60x60 frames.
Goggles: run / jump / idle / portrait-sam / sam-watering / sam-smoking come from the careers
game and have GREEN goggles (four tones: #D5FB19 rim, #75A70D lens, #457D07 strap, #2E5700 frame).
Brand canon is BLUE (#0BECFF rim, #097FCA lens, measured in sam-propeller-idle).
Swapped at load by src/game/palette.ts, together with the body colours (#AE6228 -> #BE6627,
#834622 -> #944F1E, #BD8A51/#C58F53 -> #C09564, #000000 -> #1A0505) so every Sam sheet
matches; the files in this folder are untouched.

## sam/
| file | frames | notes |
|---|---|---|
| run.png | 4 | run cycle (green goggles -> swap) |
| sam-jump.png | 1 | (green -> swap) |
| idle.png | 33 | idle loop (green -> swap) |
| sam-propeller-idle_8f_60x60.png | 8 | propeller beanie hover, blue goggles (the brand's goggle reference; no longer drawn) |
| sam-climb_6f_60x60.png | 6 | side-profile climb, blue |
| anim-sam-side-strip_8f_60x60.png | 8 | side pose, blue |
| anim-sam-wave-strip_232x25.png | 8 | tiny wave |
| anim-sam-tiny-strip_960x41.png | 24 | tiny walk |
| sam-watering.png / sam-smoking.png | 1 / 28 | spare poses |
| sam-large-newspaper/phone/suit/labcoat.png | 1 | big dressed poses (bandana + outfit) |
| sam-suit-small.png | 1 | |
| portrait-sam.png | 1 | careers dialog portrait (green -> swap) |
| sam-walk-side_29x44.png | 1 | side walking pose (green -> swap) |
| sam-front_31x44.png | 1 | facing front (green -> swap) |
| sam-three-quarter_27x44.png | 1 | three-quarter, arms crossed (green -> swap) |

## world/
- bg-*_480x320 / 509x200: Vega's own world backgrounds (green hills, city skyline, canyon,
  lake, desert, floating island, mountain/rock silhouettes, clouds strip)
- city-far 1152x590 / city-towers 2304x510 / city-mid 1151x650 / city-near 2304x1108 /
  city-near-fill 2304x144: 5-layer NYC parallax. near and near-fill repeat every 1152 px (the
  files hold two copies), mid loops at 1151; far and towers do not loop (mirror-tile them)
- big-cloud, cloud-* : clouds, many sizes. big-cloud is a 1160×729 two-colour cumulus bank; the engine crops three whole lobes out of it at load rather than drawing or scaling the bank. cloud-f/g/h/faint sit high, cloud-a/b/d in the upper-mid sky, and bg-clouds-strip is the horizon cumulus bank just above the hills. bg-hills-silhouette-light is the pale far range behind it.
- ground-daisy-row-strip, ground-grass-underground, ground-bushes-strip, tile-grass-dirt*: ground (not drawn in the game: its field is grass over grey rock, below). bg-green-hills is tiled plainly with its seam patched at load, at full saturation (no file changed); it ends at a world x and scrolls off as the city arrives.
- daisy-tiny-a..g: 9-18px daisies for ground decoration
- ground-grass-rocks-strip_960x115, ground-desert-strip_509x51: ground strips (grass over grey rock, sand over rock). The grass-rocks strip is the game's field: the file is a 17/13 enlargement, sampled back at load to its own 734 × 88 grid (each pixel's centre), its small flowers kept; its rock rows repeat downward as the fill, and a few grass tufts cut from it stand in the street's first slabs
- bg-hills-golden_509x121: the green hills (bg-green-hills) in warm sunlight, cropped to the hills
- daisy-tall_118x244: a single tall daisy on its stem, leaves to the ground (the daisy of daisy-clouds-sway without its clouds)
- bg-canyon-river_960x540: a desert canyon over a river, drawn in its bottom 103 rows only (the rest is transparent); bg-lake-hills_480x320: hills round a lake; bg-green-hills-plain_509x200: a plainer version of bg-green-hills (careers pack bg2 / bg3 / bgii, renamed)
- cloud-lg_207x130, cloud-md_128x64, cloud-sm_110x40, cloud-xs_54x33: two-colour clouds from the careers pack
- scene-threat-detected-night-rain_3600x1890: night palette reference. The schedule's Cheat Codes folder samples it back to its own 508 × 266 pixels at load (it is a 3600/509 upscale) and uses only the landscape under its window, sky keyed out and rain lifted and re-fallen; the Vega logo and the window are not shown
- scene-retro-computer, scene-floppy-disk, scene-grass-field-clouds-sam: style refs / crop for props
- daisy-clouds-sway_8f, beanstalk-sway_10f: homepage hero sheets. The schedule's Keynote and Closing Credits folders use the daisy lifted out of its clouds at load (the clouds are never drawn), and the Repair Bench folder the swaying beanstalk, both at native size

## props/
arcade-machine (VEGA marquee), vega-sign, vega-sign-horizontal, poster-i-want-you,
subway-front/back/closed, road-tile, sidewalk-tile, street-fence (the city fence behind Sam from world x 1900), tree-1 (rows 65–80 are a white planter: cropped at load in the field, kept for the street trees), plant-flowers (by the buildings after the gate), deck-chair,
plant-flowers, hand-megaphone / hand-clipboard / hand-phone / hand-scroll (mole hand in dirt),
prop-cookie, icon-bank, beach-set

doghouse (a small doghouse).
## npc/
mole-* single poses = Vega team avatars in outfits. Background crowd only; never named.
mole-coffee / typing / pizza / laptop / phone, moles-chess / sofa / ping-pong = animated strips.
dog, dog-walk (4f), dog-bark (5f).
mole-pink-dress_42x56 = single pose (blonde hair, pink sequinned dress), background crowd only.
mole-board / mole-filing / mole-watering = single poses (at a board, filing, watering); mole-sleeping = asleep, 26 frames of 47x28. Background crowd only.

## office/
The careers game's office building, as pulled from its pack (original names, native size). Only entrance-door-closing is used, for the Javits doors (new/javits-doors, below).
- building: balcony-base, balcony-base-right, balcony-door-layer-1/2, elevator-floor-1/2/3, elevator-rooftop, entrance-door, floor-tile, floor-rooftop-tile (-left, -right), ground-base-tile, ground-brick-tile, inner-wall-tile-1/2/3, pipes-tile, pipes-tile-right, wall-left-tile, wall-left-floor-0-tile, wall-left-window-tile, wall-right-tile, wall-right-brick-tile, wall-right-floor-tile, wall-right-floor-0-tile, window, window-narrow
- furniture and objects: armchair, bottle, cork-board (Vega notice board), desk-1/2/3, filing-cabinet, fridge, kitchen, kitchen-chair-left/right, kitchen-table, mug, office-chair, office-chair-side, plant-1, plant-2, shelf-plants, wall-plants
- animated strips: computers-desk.png 27 frames of 196×103 (desk of screens), elevator-doors.png 8 frames of 91×122 (opening), entrance-door-closing.png 9 frames of 323×154

## ui/
dpad, a-button, b-button (touch controls, use as-is), arrow-down,
anim-vega-coin-3f_80x24 (spinning coin, 3 frames = collectible),
daisy-logo-pixel, daisy-icon-yellow, logo.svg, logo-flower.svg
vega-logo.svg (Green 700) / vega-logo-light.svg (Daisy White): the Vega logo, wordmark and daisy together;
vega-daisy.svg: the daisy alone. frames/: vega.io UI frames (window-single, window-site, folder, document).

## monitor/ (renders of our own code, not art)
- ../monitor/monitor-off.webp, ../monitor/monitor-on.webp — the monitor posters: renders of src/monitor at rest (1440 × 900, device pixel ratio 2), cropped to the alpha, WebP q86 — screen off (shown while the 3D loads) and screen on with the game's first frame (shown wherever there is no 3D). Their placement round the slot is measured into src/monitor/poster.ts. Rendered 2026-11-09.

## NEW (drawn for 16-Bit Con)
_(add entries here as new art is created: file, size, what it is)_

- (retired 2026-11-11; the file is deleted — the field now ends in a park corner drawn from the grass-rocks strip and the sidewalk's own paving) new/seam-field-street_72x52.png — the details at the field → street ground seams, nothing more: three to four grass tufts of 2–4 px standing on the first pavement slabs after X0, a 4 px lighter kerb end-stone at X0 + 28 (sidewalk-tile's kerb top grey), and dark dirt pixels (the deep dirt tone, #4A2620) on the kerb and the first road pixels after X0 + 56. Placed with row 4 on the feet line F and x 8 on X0. Native density, Green 700 / Green 500 tufts, no scaling. Drawn by script, 2026-11-08.
- (retired 2026-11-11; the file is deleted — the daisy-row floor it filled under is gone) new/dirt-fill_256x28.png — the 28 px dirt fill under the field's edge band: the deep dirt tone (#4A2620, sampled from tile-grass-dirt) with a 1 px darker top line and a sparse scatter of 14 pixels per 256 × 28 in the daisy row's own dirt tones (its rows 59–61), the same speck density as road-tile. Tiled at the daisy row's phase. Drawn by script, 2026-11-08.
- (retired 2026-11-11; the file is deleted — replaced by new/javits-far, a far view of the plaza facade itself) new/javits-silhouette_300x100.png — Javits on the horizon: a long low glass box (3:1) with a slightly raised central block, in the towers' own colours so it sits in their depth — glass #5487E2, space-frame grid #8D9CC8 every 8 px, edges #456CB4, a one-pixel #629EFB roof line (all sampled from city-towers.png). Stands at the towers' depth on city-far's base line, first seen through the park opening at the end of Level 2, and darkens with the towers at night. Drawn by script, 2026-11-08; recoloured the same day (a black box read as the darkest thing on screen at the farthest depth).
- (retired 2026-11-11; the file is deleted — the plaza is paving now, with no daisy bed after it) new/seam-street-field_72x52.png — the plaza → daisy-bed seam details for the arrival, the field → street tile's details regrouped on the far side of each seam: tufts on the last slabs before X1, the kerb's lighter end-stone as its last 4 px before X1 + 28, dirt pixels on the kerb's end and the last road pixels before X1 + 56. F at row 4, X1 at x 16. Derived by script from seam-field-street, 2026-11-08.
- (retired 2026-11-09; the file is deleted — the breakout's cracks are drawn by the monitor itself, src/monitor/breakout.ts) new/crt-cracks_6f_240x240.png — six cumulative crack stages for the breakout, 240 × 240 each in one 1440 × 240 strip: branching cracks — nine main rays with jittered paths and two levels of side branches, fragment arcs around the impact point from stage 2 — drawn as 2 px Outline Black lines with a 1 px Daisy White edge on one side, growing 36 px per stage from the impact point at (200, 120). Composited in the game frame with the impact point 2 px inside the right edge at Sam's flying height. Drawn by script, 2026-11-08; redrawn the same day.
- new/javits-facade_1408x680.png — the real Javits for the arrival, redrawn from a reference photo: stepped glass cubes seen front-on as in the Javits front photos (Wikimedia Commons) — the tallest at centre-back and taller than any viewport, two mid cubes, two low wings, the front cube with the entrance. Every cube's edges are bevelled at 45° like the real space frame: each vertical corner is a chamfer strip down the side (Blue 100 lit on the left, Blue 700 shaded on the right), the roof edge a pale chamfer band along the top (Blue 100 with glazing bars), the two meeting in mitred, cut-off corners, with a Cloud White ridge along the outer edge and Grey 500 fold lines where the chamfers meet the face; glass in Blue 300 / Blue 500 / Blue 700 (lit right faces, shaded left faces, sky in the upper panels) with reflected clouds in Cloud White / Daisy White, the space frame as 1 px Outline Black every 8 px with 1 px Grey 700 diagonals every 16 px, Grey 500 mullions every 32 px, Cloud White ridges, eaves and corners. The entrance: a white canopy slab (Cloud White, a Daisy White soffit row, Outline Black edge) over glass doors, with two flag poles with a Florets Yellow 16-Bit Con flag and a Green 700 daisy flag. Its first 128 px are a flat annex that repeats outward on very wide screens. Drawn by script, 2026-11-08. At load (the file unchanged) its small "16" plaque and daisy flag are painted out from its own glass grid, its street-level glass is shaded a step, a soft shadow runs along its base, and new/javits-doors are set in under a canopy with a lit top face and a side (src/game/signage.ts).
- new/cypress_12x40.png — a clipped columnar tree for the row along the Javits base: Green 300 / Green 500 / Green 700 with Green 900 texture, Outline Black edge, a Grey 700 trunk. Drawn by script, 2026-11-08.
- new/pixel-letters_5x7.png — a 5 × 7 pixel letter set in the vega-sign yellow-tile style: A–Z, 0–9, hyphen and middle dot, each on its own tile — Florets Yellow with a 1 px Outline Black edge and rounded corners, a Yellow 100 / Yellow 500 bevel, Outline Black letters. Four rows: small (1 px per glyph cell, 9 × 11 tiles), large (2 px per cell, 14 × 18), and the same two as neon for the night (Outline Black tiles, a Yellow 600 edge, Yellow 100 letters). The engine reads its glyph shapes for plain pixel type (the poster's OCT 3-5 and JAVITS NYC, BOOTH 630 →), and the small tiles spell VEGA on the phones' compact Booth sign. Drawn by script, 2026-11-08.
- (retired 2026-11-11; the file is deleted — the Booth 630 sign's post is drawn in code with the sign) new/sign-post_10x72.png — the post for the Booth 630 sign: Grey 700 with Outline Black edges and a Grey 500 highlight, tall enough that the board clears the daisies and Sam's head. Drawn by script, 2026-11-08.
- new/javits-far_176x85.png — the Javits Center far down the avenue, in the city's far layers: the plaza facade (new/javits-facade) at 1:8, each pixel the most common colour of its 8 × 8 block so it keeps only the facade's own colours, with a faint 4 px grid. Its glass goes dark at night with the city. Made by script, 2026-11-11.
- new/javits-doors_270x67.png — the Javits entrance: Vega's careers entrance doors (office/entrance-door-closing, its closed frame) halved, keeping their frame lines (each 2 × 2 block's darkest line colour, else its most common), and two units merged on a shared window. Made by script, 2026-11-11.

Drawn in code at load (no file), from the brand tokens and the art above:
- The flyer (src/game/flyer-art.ts): the falling sheet and the one lying on the ground — paper, an orange band, a green rule, the wordmark and the arcade machine, rasterised at each tilt so its outline stays crisp.
- The 16-Bit Con wordmark as pixels (src/game/wordmark-pixels.ts): the page wordmark's own paths (src/data/wordmark.ts) filled at a whole-pixel width and thresholded, for the signs.
- Signage (src/game/signage.ts): the 16-Bit Con poster (the wordmark, the arcade machine's top, OCT 3-5, JAVITS NYC, a FREE star) in a city ad panel with depth; the 16-Bit Con channel letters on the Javits tower, Green 900 with Green 500 returns; the Booth 630 sign, a Leaf Green box with depth around Vega's tiles and daisy, and a compact one for phones; their posts.
