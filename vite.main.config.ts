import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@stego-crypto': path.resolve(__dirname, 'packages/stego-crypto/src'),
    },
  },
});
