import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			// Claude Code-style warm neutrals: the app's hardcoded `slate-*`
  			// classes resolve to this stone ramp instead of Tailwind's cool
  			// blue-gray, re-skinning every surface in one place.
  			slate: {
  				50: '#fafaf9',
  				100: '#f5f5f4',
  				200: '#e7e5e4',
  				300: '#d6d3d1',
  				400: '#a8a29e',
  				500: '#78716c',
  				600: '#57534e',
  				700: '#44403c',
  				800: '#292524',
  				900: '#1c1917',
  				950: '#100f0e'
  			},
  			// The app uses `blue-*` as its accent throughout — remapped to the
  			// Claude terracotta ramp (#d97757 at 500).
  			blue: {
  				50: '#fdf5f1',
  				100: '#fbe9e1',
  				200: '#f6d0bf',
  				300: '#efb39a',
  				400: '#e69373',
  				500: '#d97757',
  				600: '#c45f3f',
  				700: '#a34c31',
  				800: '#843e2a',
  				900: '#6b3424',
  				950: '#3a1a11'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			'accent-brand': 'hsl(var(--accent-brand))',
  			success: 'hsl(var(--success))',
  			warning: 'hsl(var(--warning))',
  			running: 'hsl(var(--running))',
  			wb: {
  				titlebar: 'hsl(var(--wb-titlebar))',
  				activitybar: 'hsl(var(--wb-activitybar))',
  				sidepanel: 'hsl(var(--wb-sidepanel))',
  				statusbar: 'hsl(var(--wb-statusbar))',
  				border: 'hsl(var(--wb-border))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
}

export default config
