import type { Metadata } from 'next'
import { Manrope, Newsreader } from 'next/font/google'
import './globals.css'
import StoreProvider from '@/store/StoreProvider'
import { ThemeProvider } from "@/components/ThemeProvider"

const uiSans = Manrope({
  subsets: ['latin'],
  variable: '--font-ui-sans',
  display: 'swap',
})

const headlineSerif = Newsreader({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ScriptManager',
  description: 'A self-hosted script manager for running, scheduling, and organizing scripts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${uiSans.variable} ${headlineSerif.variable}`}>
        <StoreProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
