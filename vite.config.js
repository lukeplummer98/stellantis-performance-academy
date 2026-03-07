import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr'],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
