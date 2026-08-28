// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/app/login/page'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('desktop login suppression', () => {
  afterEach(() => {
    delete (window as Window & { __ELECTRON__?: boolean }).__ELECTRON__
    replace.mockReset()
  })

  it('does not render the password form in Electron mode', async () => {
    ;(window as Window & { __ELECTRON__?: boolean }).__ELECTRON__ = true

    render(<LoginPage />)

    expect(screen.queryByLabelText('Password')).toBeNull()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })
})
