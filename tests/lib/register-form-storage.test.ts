import { describe, it, expect } from 'vitest'
import {
  saveRegisterDraft,
  loadRegisterDraft,
  clearRegisterDraft,
  REGISTER_DRAFT_STORAGE_KEY,
  type RegisterFormDraftFields,
  type DraftStorage,
} from '@/lib/register-form-storage'

function makeFakeStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

const sampleDraft: RegisterFormDraftFields = {
  step: 1,
  prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', nickname: '',
  email: 'somchai@example.com', phone: '0812345678', lineId: '@somchai',
  birthDate: '', nationalId: '1234567890123', nationality: 'ไทย', maritalStatus: 'โสด',
  role: 'EMPLOYEE', branchId: 'b1', socialSecurity: true,
  currentHouseNo: '123', currentMoo: '', currentSoi: '', currentRoad: '',
  currentTambon: '', currentAmphoe: '', currentProvince: '', currentPostalCode: '',
  sameAsCurrentAddress: true,
  regHouseNo: '', regMoo: '', regSoi: '', regRoad: '',
  regTambon: '', regAmphoe: '', regProvince: '', regPostalCode: '',
  emergencyContacts: [{ name: 'สมหญิง', relationship: 'มารดา', phone: '0898765432', altPhone: '' }],
}

describe('register-form-storage', () => {
  it('round-trips a draft through save then load', () => {
    const storage = makeFakeStorage()
    saveRegisterDraft(sampleDraft, storage)
    expect(loadRegisterDraft(storage)).toEqual(sampleDraft)
  })

  it('never writes password fields (the type doesn\'t even carry them)', () => {
    const storage = makeFakeStorage()
    saveRegisterDraft(sampleDraft, storage)
    const raw = storage.data.get(REGISTER_DRAFT_STORAGE_KEY)!
    expect(raw).not.toContain('password')
  })

  it('returns null when nothing has been saved yet', () => {
    const storage = makeFakeStorage()
    expect(loadRegisterDraft(storage)).toBeNull()
  })

  it('returns null for corrupted JSON instead of throwing', () => {
    const storage = makeFakeStorage()
    storage.setItem(REGISTER_DRAFT_STORAGE_KEY, '{not valid json')
    expect(loadRegisterDraft(storage)).toBeNull()
  })

  it('returns null for a validly-parsed but wrong-shaped payload', () => {
    const storage = makeFakeStorage()
    storage.setItem(REGISTER_DRAFT_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadRegisterDraft(storage)).toBeNull()
  })

  it('clears the draft so a subsequent load returns null', () => {
    const storage = makeFakeStorage()
    saveRegisterDraft(sampleDraft, storage)
    clearRegisterDraft(storage)
    expect(loadRegisterDraft(storage)).toBeNull()
  })

  it('never throws when the underlying storage throws (quota/private-browsing)', () => {
    const throwingStorage: DraftStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(() => saveRegisterDraft(sampleDraft, throwingStorage)).not.toThrow()
    expect(() => loadRegisterDraft(throwingStorage)).not.toThrow()
    expect(() => clearRegisterDraft(throwingStorage)).not.toThrow()
    expect(loadRegisterDraft(throwingStorage)).toBeNull()
  })

  it('uses a storage key that does not collide with any existing key in this app', () => {
    const knownExistingKeys = [
      'sidebar-collapsed', 'sidebar-sections', 'pwa-install-dismissed-until',
      'hrflow_attendance_local_v1', 'hrflow_device_id',
    ]
    expect(knownExistingKeys).not.toContain(REGISTER_DRAFT_STORAGE_KEY)
  })
})
