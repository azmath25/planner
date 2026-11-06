import { defineConfig } from 'vite';

// GitHub Pages remains "Deploy from a branch": main / (root).
// CI builds Vite's output and commits the generated site to the same main branch.
export default defineConfig({
  root: 'web',
  base: '/planner/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsDir: 'assets',
  },
});
