import { describe, it, expect } from 'vitest'
import { listThaiProvinces, listThaiDistricts, listThaiSubdistricts } from '@/lib/thai-address'
import { BANGKOK_PROVINCE_CODE } from '@/lib/thai-address-shared'

describe('listThaiProvinces', () => {
  it('returns all 77 Thai provinces', () => {
    expect(listThaiProvinces()).toHaveLength(77)
  })

  it('includes Bangkok at the documented BANGKOK_PROVINCE_CODE', () => {
    const bkk = listThaiProvinces().find((p) => p.code === BANGKOK_PROVINCE_CODE)
    expect(bkk?.name_th).toBe('กรุงเทพมหานคร')
  })

  it('never returns a nested districts/subdistricts tree — flat {code, name_th} only', () => {
    const provinces = listThaiProvinces()
    for (const p of provinces) {
      expect(Object.keys(p).sort()).toEqual(['code', 'name_th'])
    }
  })
})

describe('listThaiDistricts', () => {
  it("returns Bangkok's districts (เขต), scoped to that province only", () => {
    const districts = listThaiDistricts(BANGKOK_PROVINCE_CODE)
    expect(districts.length).toBeGreaterThan(40) // Bangkok has 50 khet
    expect(districts.some((d) => d.name_th === 'พระนคร')).toBe(true)
  })

  it('never returns a nested subdistricts array — flat {code, name_th} only', () => {
    const districts = listThaiDistricts(BANGKOK_PROVINCE_CODE)
    for (const d of districts) {
      expect(Object.keys(d).sort()).toEqual(['code', 'name_th'])
    }
  })

  it('returns an empty array for a non-numeric or unknown province code, never throws', () => {
    expect(() => listThaiDistricts('not-a-code')).not.toThrow()
    expect(listThaiDistricts('not-a-code')).toEqual([])
    expect(listThaiDistricts('999999')).toEqual([])
    expect(listThaiDistricts('')).toEqual([])
  })
})

describe('listThaiSubdistricts', () => {
  it('returns subdistricts for a known district, each carrying its own postal_code', () => {
    const [phraNakhon] = listThaiDistricts(BANGKOK_PROVINCE_CODE).filter((d) => d.name_th === 'พระนคร')
    const subs = listThaiSubdistricts(phraNakhon.code)
    expect(subs.length).toBeGreaterThan(0)
    expect(subs.every((s) => /^\d{5}$/.test(s.postal_code))).toBe(true)
  })

  it('returns an empty array for an unknown district code, never throws', () => {
    expect(() => listThaiSubdistricts('not-a-code')).not.toThrow()
    expect(listThaiSubdistricts('999999')).toEqual([])
  })
})
