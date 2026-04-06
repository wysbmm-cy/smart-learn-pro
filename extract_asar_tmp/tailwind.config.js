/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"LXGW WenKai"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
        mono: ['"LXGW WenKai"', 'monospace'], // For Chinese code blocks readability
      },
      colors: {
        phy: {
          bg: 'var(--phy-bg-base)',
          glass: 'var(--phy-bg-glass)',
          glassHeavy: 'var(--phy-bg-glass-heavy)',
          card: 'var(--phy-bg-card)',
          border: 'var(--phy-border)',
          borderHover: 'var(--phy-border-hover)',
          text: 'var(--phy-text-main)',
          muted: 'var(--phy-text-muted)',
          accent: 'var(--phy-accent)',
          accentHover: 'var(--phy-accent-hover)',
          accentGlass: 'var(--phy-accent-glass)',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
