# 16-Bit Con — Vega design-engineer take-home

Landing page for a fictional retro tech convention, built on Vega's pixel-art brand.
Live: https://16-bit-con-seven.vercel.app (the page opens on a yellow late-80s monitor built in code with three.js — the only 3D on the page, loaded after the page itself — that powers on with the game live on its screen; PRESS START sits on the screen and the monitor turns toward the mouse; scrolling — or PRESS START — dives the camera into the screen, where it lands on the game pixel for pixel. Then the whole run — the field, the walk into town, the afternoon street, golden hour through the park opening, the night with its windows lighting one by one up to the after party, and the dawn breaking over the Javits plaza, the game's last level, where Sam stops at the Booth 630 sign. Then the camera pulls back out to the monitor: six hits crack its glass (mash Space, tap the screen, or just wait a second), Sam jumps through it as it bursts — clear glass flying every way at once, some of it at you, the rest falling to the floor round the monitor, where big pieces break again — and lands on the Register window as the pin releases into it. Scroll, or hold → to run and Space to jump; on phones the d-pad and A drive the pinned world; the static page, with the monitor powered on, remains the reduced-motion and no-WebGL fallback. The "16-Bit Con" wordmark is Geist 900 with a plain hyphen; OG image at /og.png. The windows, buttons and fields follow the brand at vega.io's scale.)
See public/sprites/SOURCES.md for asset provenance.

TODO before Phase 0:
- [x] PPMondwest-Regular.woff2 in public/fonts (converted from the Pangram Pangram OTF; EULA is free-for-personal-use)
- [x] Signifier-Variable.woff2 in public/fonts (Klim Type Foundry test font: internal and pitch use only under Klim's test licence; replace with a licensed copy before a public launch)
- [x] git init, log in to Vercel CLI
- [x] Vercel project `16-bit-con` linked and deployed (`vercel deploy --prod`)
- [ ] create GitHub repo and add it as origin
