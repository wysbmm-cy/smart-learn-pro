import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: process.env.GITHUB_ACTIONS === 'true' ? '/smart-learn-pro/' : '/', // Use subpath for GH Pages, root for Vercel/Others
    optimizeDeps: {
        exclude: ['react-resizable-panels']
    }
})
