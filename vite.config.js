import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: '/smart-learn-pro/', // Set base path for GitHub Pages
    optimizeDeps: {
        exclude: ['react-resizable-panels']
    }
})
