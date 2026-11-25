import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Relative base so the build works on GitHub Pages under /<repo>/.
export default defineConfig({
  base: './',
  plugins: [
    {
      // give each deploy its own service-worker cache name
      name: 'stamp-sw',
      apply: 'build',
      closeBundle() {
        const sw = resolve(__dirname, 'dist/sw.js');
        if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', Date.now().toString(36)));
      },
    },
  ],
});
