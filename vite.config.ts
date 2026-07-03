import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  build: {
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/handle-proxy': {
        target: 'https://handle.antfu.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/handle-proxy/, '') || '/',
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
}))
