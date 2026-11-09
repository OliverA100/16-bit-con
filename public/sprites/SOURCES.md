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
| sam-propeller-idle_8f_60x60.png | 8 | propeller beanie hover, blue goggles |
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
- big-cloud, cloud-* : clouds, many sizes
- ground-daisy-row-strip, ground-grass-underground, ground-bushes-strip, tile-grass-dirt*: ground
- daisy-tiny-a..g: 9-18px daisies for ground decoration
- ground-grass-rocks-strip_960x115, ground-desert-strip_509x51: ground strips (grass over grey rock, sand over rock)
- bg-hills-golden_509x121: the green hills (bg-green-hills) in warm sunlight, cropped to the hills
- daisy-tall_118x244: a single tall daisy on its stem, leaves to the ground (the daisy of daisy-clouds-sway without its clouds)
- bg-canyon-river_960x540: a desert canyon over a river, drawn in its bottom 103 rows only (the rest is transparent); bg-lake-hills_480x320: hills round a lake; bg-green-hills-plain_509x200: a plainer version of bg-green-hills (careers pack bg2 / bg3 / bgii, renamed)
- cloud-lg_207x130, cloud-md_128x64, cloud-sm_110x40, cloud-xs_54x33: two-colour clouds from the careers pack
- scene-threat-detected-night-rain_3600x1890: NIGHT PALETTE REFERENCE, do not ship as-is
- scene-retro-computer, scene-floppy-disk, scene-grass-field-clouds-sam: style refs / crop for props
- daisy-clouds-sway_8f, beanstalk-sway_10f: homepage hero sheets, reference only (do not reuse the daisy hero)

## props/
arcade-machine (VEGA marquee), vega-sign, vega-sign-horizontal, poster-i-want-you,
subway-front/back/closed, road-tile, sidewalk-tile, street-fence, tree-1, deck-chair,
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
The careers game's office building, as pulled from its pack (original names, native size, unused so far).
- building: balcony-base, balcony-base-right, balcony-door-layer-1/2, elevator-floor-1/2/3, elevator-rooftop, entrance-door, floor-tile, floor-rooftop-tile (-left, -right), ground-base-tile, ground-brick-tile, inner-wall-tile-1/2/3, pipes-tile, pipes-tile-right, wall-left-tile, wall-left-floor-0-tile, wall-left-window-tile, wall-right-tile, wall-right-brick-tile, wall-right-floor-tile, wall-right-floor-0-tile, window, window-narrow
- furniture and objects: armchair, bottle, cork-board (Vega notice board), desk-1/2/3, filing-cabinet, fridge, kitchen, kitchen-chair-left/right, kitchen-table, mug, office-chair, office-chair-side, plant-1, plant-2, shelf-plants, wall-plants
- animated strips: computers-desk.png 27 frames of 196×103 (desk of screens), elevator-doors.png 8 frames of 91×122 (opening), entrance-door-closing.png 9 frames of 323×154

## ui/
dpad, a-button, b-button (touch controls, use as-is), arrow-down,
anim-vega-coin-3f_80x24 (spinning coin, 3 frames = collectible),
daisy-logo-pixel, daisy-icon-yellow, logo.svg, logo-flower.svg
vega-logo.svg (Green 700) / vega-logo-light.svg (Daisy White): the Vega logo, wordmark and daisy together;
vega-daisy.svg: the daisy alone. frames/: vega.io UI frames (window-single, window-site, folder, document).

## NEW (drawn for 16-Bit Con)
_(add entries here as new art is created: file, size, what it is)_
