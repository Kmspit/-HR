import { describe, it, expect } from 'vitest'
import { diffFormPayload } from '@/lib/form-diff'

describe('diffFormPayload — only touched fields are sent', () => {
  const initial = {
    position: 'Lawyer',
    nationalId: '', // not fetched by the server page — see SAFE_USER_SELECT opt-in
    role: 'EMPLOYEE',
    status: 'ACTIVE',
  }

  const transforms = {
    position: (form: typeof initial) => form.position.trim(),
    nationalId: (form: typeof initial) => form.nationalId.replace(/\D/g, '') || null,
    role: (form: typeof initial) => form.role,
    status: (form: typeof initial) => form.status,
  }

  // bind transforms to a given `form` the way the component does (closures over `form`)
  function transformsFor(form: typeof initial) {
    return {
      position: () => transforms.position(form),
      nationalId: () => transforms.nationalId(form),
      role: () => transforms.role(form),
      status: () => transforms.status(form),
    }
  }

  it('editing only position never includes nationalId in the payload', () => {
    const form = { ...initial, position: 'Senior Lawyer' }
    const payload = diffFormPayload(form, initial, transformsFor(form))
    expect(payload).toEqual({ position: 'Senior Lawyer' })
    expect(payload).not.toHaveProperty('nationalId')
  })

  it('returns an empty payload when nothing changed', () => {
    const form = { ...initial }
    const payload = diffFormPayload(form, initial, transformsFor(form))
    expect(payload).toEqual({})
  })

  it('includes nationalId only when it was actually edited', () => {
    const form = { ...initial, nationalId: '1234567890123' }
    const payload = diffFormPayload(form, initial, transformsFor(form))
    expect(payload).toEqual({ nationalId: '1234567890123' })
  })

  it('excludes a changed field when skip(key) says so, even though it differs from initial', () => {
    const form = { ...initial, role: 'ADMIN', status: 'ACTIVE' }
    const payload = diffFormPayload(form, initial, transformsFor(form), (key) => key === 'role')
    expect(payload).toEqual({}) // role changed but skipped; status didn't change
  })

  it('runs the transform, not a raw copy, for changed fields', () => {
    const form = { ...initial, position: '  Senior Lawyer  ' }
    const payload = diffFormPayload(form, initial, transformsFor(form))
    expect(payload.position).toBe('Senior Lawyer') // trimmed by the transform
  })

  it('เรียก "ดูเลขเต็ม" (GET /sensitive) แล้วไม่แก้ไข — nationalId ไม่อยู่ใน payload', () => {
    // EmployeeEditClient sets BOTH form.nationalId and initialFormRef.current.nationalId
    // to the revealed value on a successful fetch — this proves that pattern actually
    // keeps nationalId out of the diff when the user only viewed, never edited, it.
    const revealedValue = '1234567890123'
    const initialAfterReveal = { ...initial, nationalId: revealedValue }
    const formAfterReveal = { ...initial, nationalId: revealedValue }
    const payload = diffFormPayload(formAfterReveal, initialAfterReveal, transformsFor(formAfterReveal))
    expect(payload).not.toHaveProperty('nationalId')
  })

  it('เรียก "ดูเลขเต็ม" แล้วแก้ไขค่า — nationalId ค่าใหม่ (ที่แก้) อยู่ใน payload', () => {
    const revealedValue = '1234567890123'
    const initialAfterReveal = { ...initial, nationalId: revealedValue }
    const formAfterReveal = { ...initial, nationalId: '9876543210123' } // HR corrected it
    const payload = diffFormPayload(formAfterReveal, initialAfterReveal, transformsFor(formAfterReveal))
    expect(payload).toEqual({ nationalId: '9876543210123' })
  })
})
