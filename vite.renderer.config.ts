import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stego-crypto': path.resolve(__dirname, 'packages/stego-crypto/src'),
    },
  },
});
