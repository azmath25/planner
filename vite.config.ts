import { defineConfig } from 'vite';

// GitHub Pages remains at /planner/ until an explicitly approved production cutover.
// An isolated Vercel staging build is root-hosted and must opt in explicitly.
export default defineConfig({
  root: 'web',
  base: process.env.VITE_DAYFRAME_TARGET === 'staging' ? '/' : '/planner/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsDir: 'assets',
  },
});
