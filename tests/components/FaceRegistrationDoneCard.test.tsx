// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import FaceRegistrationDoneCard from '@/components/attendance/FaceRegistrationDoneCard'

afterEach(() => cleanup())

describe('FaceRegistrationDoneCard — first-time registration (allowUpdate falsy)', () => {
  it('shows "ลงทะเบียนใบหน้าแล้ว", not the update-mode title', () => {
    render(<FaceRegistrationDoneCard onUpdateAgain={vi.fn()} />)
    expect(screen.getByText('ลงทะเบียนใบหน้าแล้ว')).toBeTruthy()
    expect(screen.queryByText('อัปเดตใบหน้าเรียบร้อย')).toBeNull()
  })

  it('renders no "อัปเดตอีกครั้ง"/"เสร็จสิ้น" buttons — byte-identical to the pre-fix output, which had none', () => {
    render(<FaceRegistrationDoneCard onUpdateAgain={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'อัปเดตอีกครั้ง' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'เสร็จสิ้น' })).toBeNull()
  })

  it('renders identically whether allowUpdate is explicitly false or simply omitted', () => {
    const { container: withFalse } = render(<FaceRegistrationDoneCard allowUpdate={false} onUpdateAgain={vi.fn()} />)
    const htmlFalse = withFalse.innerHTML
    cleanup()
    const { container: omitted } = render(<FaceRegistrationDoneCard onUpdateAgain={vi.fn()} />)
    expect(omitted.innerHTML).toBe(htmlFalse)
  })

  it('matches the exact markup the old phase==="done" && !allowUpdate branch produced (byte-identical claim, verified concretely)', () => {
    const { container } = render(<FaceRegistrationDoneCard onUpdateAgain={vi.fn()} />)
    expect(container.innerHTML).toBe(
      '<div class="glass-card rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'class="lucide lucide-circle-check-big w-8 h-8 text-green-400 flex-shrink-0">' +
        '<path d="M21.801 10A10 10 0 1 1 17 3.335"></path><path d="m9 11 3 3L22 4"></path></svg>' +
        '<div><p class="text-sm font-semibold dark:text-white light:text-slate-900">ลงทะเบียนใบหน้าแล้ว</p>' +
        '<p class="text-xs dark:text-slate-400 light:text-slate-600">ลงเวลาทุกครั้งต้องสแกนใบหน้าให้ตรงกับที่ลงทะเบียน</p></div></div>',
    )
  })

  it('shows the standard instructional subtitle', () => {
    render(<FaceRegistrationDoneCard onUpdateAgain={vi.fn()} />)
    expect(screen.getByText('ลงเวลาทุกครั้งต้องสแกนใบหน้าให้ตรงกับที่ลงทะเบียน')).toBeTruthy()
  })
})

describe('FaceRegistrationDoneCard — update mode (allowUpdate=true)', () => {
  it('shows "อัปเดตใบหน้าเรียบร้อย", not the first-time title', () => {
    render(<FaceRegistrationDoneCard allowUpdate onUpdateAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText('อัปเดตใบหน้าเรียบร้อย')).toBeTruthy()
    expect(screen.queryByText('ลงทะเบียนใบหน้าแล้ว')).toBeNull()
  })

  it('renders both "อัปเดตอีกครั้ง" and "เสร็จสิ้น" buttons', () => {
    render(<FaceRegistrationDoneCard allowUpdate onUpdateAgain={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'อัปเดตอีกครั้ง' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เสร็จสิ้น' })).toBeTruthy()
  })

  it('clicking "อัปเดตอีกครั้ง" calls onUpdateAgain', () => {
    const onUpdateAgain = vi.fn()
    render(<FaceRegistrationDoneCard allowUpdate onUpdateAgain={onUpdateAgain} onDone={vi.fn()} />)
    screen.getByRole('button', { name: 'อัปเดตอีกครั้ง' }).click()
    expect(onUpdateAgain).toHaveBeenCalledTimes(1)
  })

  it('clicking "เสร็จสิ้น" calls onDone', () => {
    const onDone = vi.fn()
    render(<FaceRegistrationDoneCard allowUpdate onUpdateAgain={vi.fn()} onDone={onDone} />)
    screen.getByRole('button', { name: 'เสร็จสิ้น' }).click()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not throw when onDone is omitted and "เสร็จสิ้น" is clicked', () => {
    render(<FaceRegistrationDoneCard allowUpdate onUpdateAgain={vi.fn()} />)
    expect(() => screen.getByRole('button', { name: 'เสร็จสิ้น' }).click()).not.toThrow()
  })
})
