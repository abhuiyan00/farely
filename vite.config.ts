import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Dev server: auto-open the browser at the bound localhost port on `npm run dev`.
  // /fe-api proxies the fueleconomy.gov car-spec REST API (no CORS headers on
  // their side; on Android the app calls it natively via CapacitorHttp instead).
  server: {
    open: true,
    proxy: {
      '/fe-api': {
        target: 'https://www.fueleconomy.gov/ws/rest',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fe-api/, ''),
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
