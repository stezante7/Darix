import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /Darix/ sub-path (and anywhere else).
  base: './',
});
