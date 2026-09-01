import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoreProvider from '@/store/StoreProvider'
import Page from '@/app/page'

function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Page />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </StoreProvider>
  )
}

export default App
