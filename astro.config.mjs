// @ts-check
import { defineConfig } from 'astro/config';

// 16-Bit Con — static Astro site. No adapter: Vercel serves dist/ as static files.
export default defineConfig({
  site: 'https://16-bit-con-seven.vercel.app',
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
