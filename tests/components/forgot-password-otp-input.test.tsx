// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: { sent: true, message: 'ส่งรหัส OTP แล้ว' }, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22) — the OTP field used type="text" with no
 * inputMode at all, forcing the full QWERTY keyboard on mobile for a 6-digit
 * numeric code every user hits during password reset. Mirrors the exact
 * pattern already used for the 2FA OTP field in components/auth/LoginForm.tsx.
 */
describe('ForgotPasswordPage — OTP step input triggers a numeric keyboard on mobile', () => {
  it('renders the OTP input with inputMode="numeric" and pattern="[0-9]*" after advancing past the email step', async () => {
    render(<ForgotPasswordPage />)

    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งรหัส OTP' }))

    const otpInput = await waitFor(() => screen.getByPlaceholderText('000000'))
    expect(otpInput.getAttribute('inputMode')).toBe('numeric')
    expect(otpInput.getAttribute('pattern')).toBe('[0-9]*')
    expect(otpInput.getAttribute('maxLength')).toBe('6')
  })
})
