import { describe, it, expect } from 'vitest'
import {
  employeeProfileLoadReducer,
  initialEmployeeProfileLoadState,
  employeeProfileLoadErrorMessage,
  employeeProfileLoadCanRetry,
  shouldStartEmployeeProfileLoad,
  type EmployeeProfileLoadState,
  type EmployeeProfileLoadData,
} from '@/lib/employee-profile-load'

function data(): EmployeeProfileLoadData {
  return {
    nationality: 'ไทย',
    maritalStatus: '',
    personalEmail: '',
    currentAddress: { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' },
    registeredAddress: { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' },
    sameAsCurrentAddress: false,
  }
}

describe('employeeProfileLoadErrorMessage', () => {
  it('gives 403 its own "no permission" message', () => {
    expect(employeeProfileLoadErrorMessage(403)).toBe('ไม่มีสิทธิ์ดูข้อมูลนี้')
  })

  it('gives every other status a generic retry-able message', () => {
    expect(employeeProfileLoadErrorMessage(500)).toBe('โหลดข้อมูลไม่สำเร็จ')
    expect(employeeProfileLoadErrorMessage(0)).toBe('โหลดข้อมูลไม่สำเร็จ')
  })
})

describe('employeeProfileLoadCanRetry', () => {
  it('is false for 403', () => {
    expect(employeeProfileLoadCanRetry(403)).toBe(false)
  })

  it('is true for every other status', () => {
    expect(employeeProfileLoadCanRetry(500)).toBe(true)
    expect(employeeProfileLoadCanRetry(0)).toBe(true)
  })
})

describe('shouldStartEmployeeProfileLoad', () => {
  it('starts only when active and not already started', () => {
    expect(shouldStartEmployeeProfileLoad(true, false)).toBe(true)
  })

  it('never starts a second time once already started', () => {
    expect(shouldStartEmployeeProfileLoad(true, true)).toBe(false)
  })

  it('never starts while the tab is not active', () => {
    expect(shouldStartEmployeeProfileLoad(false, false)).toBe(false)
    expect(shouldStartEmployeeProfileLoad(false, true)).toBe(false)
  })
})

describe('employeeProfileLoadReducer', () => {
  it('starts at idle', () => {
    expect(initialEmployeeProfileLoadState).toEqual({ phase: 'idle' })
  })

  it('START moves to loading from any state', () => {
    expect(employeeProfileLoadReducer(initialEmployeeProfileLoadState, { type: 'START' })).toEqual({ phase: 'loading' })
    const errored: EmployeeProfileLoadState = { phase: 'error', message: 'x', canRetry: true }
    expect(employeeProfileLoadReducer(errored, { type: 'START' })).toEqual({ phase: 'loading' })
  })

  it('SUCCESS moves to loaded with the given data', () => {
    const d = data()
    const result = employeeProfileLoadReducer({ phase: 'loading' }, { type: 'SUCCESS', data: d })
    expect(result).toEqual({ phase: 'loaded', data: d })
  })

  it('FAILURE moves to error with the right message/canRetry for the status', () => {
    const forbidden = employeeProfileLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 403 })
    expect(forbidden).toEqual({ phase: 'error', message: 'ไม่มีสิทธิ์ดูข้อมูลนี้', canRetry: false })

    const serverError = employeeProfileLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 500 })
    expect(serverError).toEqual({ phase: 'error', message: 'โหลดข้อมูลไม่สำเร็จ', canRetry: true })
  })

  it('every reachable path from loading ends in a terminal (loaded/error) state — never stuck', () => {
    const afterSuccess = employeeProfileLoadReducer({ phase: 'loading' }, { type: 'SUCCESS', data: data() })
    const afterFailure = employeeProfileLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 0 })
    expect(afterSuccess.phase).not.toBe('loading')
    expect(afterFailure.phase).not.toBe('loading')
  })

  it('retry (a new START) from an error state moves back to loading', () => {
    const errored: EmployeeProfileLoadState = { phase: 'error', message: 'โหลดข้อมูลไม่สำเร็จ', canRetry: true }
    expect(employeeProfileLoadReducer(errored, { type: 'START' })).toEqual({ phase: 'loading' })
  })
})
