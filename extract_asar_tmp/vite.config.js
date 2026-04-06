import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './', // Relative path for Electron compatibility
    optimizeDeps: {
        exclude: ['react-resizable-panels']
    }
})
