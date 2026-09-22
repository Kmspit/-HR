// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: { branches: [] }, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

import RegisterForm from '@/components/auth/RegisterForm'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22) — the 13-digit Thai national ID field on the
 * main registration form (step 0, shown immediately on mount) used type="text"
 * with no inputMode at all, forcing the full QWERTY keyboard on mobile for
 * every new employee onboarding. Mirrors the pattern already used for the
 * same field on the employee-edit page (EmployeeEditClient.tsx) and the
 * dependent nationalId field (DependentSection.tsx).
 */
describe('RegisterForm — national ID input triggers a numeric keyboard on mobile', () => {
  it('renders with inputMode="numeric" on initial mount (step 0)', () => {
    render(<RegisterForm />)
    const input = screen.getByPlaceholderText('1234567890123')
    expect(input.getAttribute('inputMode')).toBe('numeric')
    expect(input.getAttribute('maxLength')).toBe('13')
  })
})
