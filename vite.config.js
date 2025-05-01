import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0
  },
  publicDir: 'static',
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.mp3', '**/*.png', '**/*.jpg', '**/*.jpeg']
}) 