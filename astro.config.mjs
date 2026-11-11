// @ts-check
import { defineConfig } from 'astro/config';

/** The sound tuning page, /dev/sound: only under `astro dev`, never in the build. */
/** @type {import('astro').AstroIntegration} */
const devPages = {
  name: 'dev-pages',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') injectRoute({ pattern: '/dev/sound', entrypoint: './src/dev/sound.astro' });
    },
  },
};

// 16-Bit Con — static Astro site. No adapter: Vercel serves dist/ as static files.
export default defineConfig({
  integrations: [devPages],
  site: 'https://16-bit-con-seven.vercel.app',
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
