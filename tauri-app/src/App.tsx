import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import StoreProvider from '@/store/StoreProvider'
import Page from '@/app/page'

function App() {
  return (
    // Class-based theming for the workbench: `.dark` on <html> drives every
    // token in index.css. The storageKey must match the pre-paint snippet in
    // index.html so the saved theme applies before first render.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="scriptmanager-theme" disableTransitionOnChange>
      <StoreProvider>
        <BrowserRouter>
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<Page />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </StoreProvider>
    </ThemeProvider>
  )
}

export default App
