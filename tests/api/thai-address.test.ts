import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as GET_PROVINCES } from '@/app/api/thai-address/provinces/route'
import { GET as GET_DISTRICTS } from '@/app/api/thai-address/districts/route'
import { GET as GET_SUBDISTRICTS } from '@/app/api/thai-address/subdistricts/route'
import { BANGKOK_PROVINCE_CODE } from '@/lib/thai-address-shared'

// No mocking — geothai is deterministic offline reference data, same
// convention as testing thai-banks/register-form-validation directly.

describe('GET /api/thai-address/provinces', () => {
  it('returns all 77 provinces as a flat list', async () => {
    const res = await GET_PROVINCES()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.provinces).toHaveLength(77)
  })

  it('payload never carries a nested districts/subdistricts tree (the whole-country dump this endpoint exists to avoid)', async () => {
    const res = await GET_PROVINCES()
    const raw = await res.text()
    expect(raw).not.toContain('"districts"')
    expect(raw).not.toContain('"subdistricts"')
    // Sanity ceiling — the full nested geothai tree is several MB; a flat
    // 77-row list should be a couple KB at most.
    expect(raw.length).toBeLessThan(20_000)
  })
})

describe('GET /api/thai-address/districts', () => {
  it('returns [] when provinceCode is missing, without touching geothai', async () => {
    const res = await GET_DISTRICTS(new NextRequest('http://localhost/api/thai-address/districts'))
    expect(res.status).toBe(200)
    expect((await res.json()).districts).toEqual([])
  })

  it("returns only the requested province's districts, not the whole country", async () => {
    const res = await GET_DISTRICTS(new NextRequest(`http://localhost/api/thai-address/districts?provinceCode=${BANGKOK_PROVINCE_CODE}`))
    const data = await res.json()
    expect(data.districts.length).toBeGreaterThan(40)
    expect(data.districts.length).toBeLessThan(60) // Bangkok has 50 khet — nowhere near a nationwide ~928
  })

  it('payload never carries a nested subdistricts array', async () => {
    const res = await GET_DISTRICTS(new NextRequest(`http://localhost/api/thai-address/districts?provinceCode=${BANGKOK_PROVINCE_CODE}`))
    const raw = await res.text()
    expect(raw).not.toContain('"subdistricts"')
    expect(raw.length).toBeLessThan(10_000)
  })

  it('an unknown province code returns [] rather than throwing a 500', async () => {
    const res = await GET_DISTRICTS(new NextRequest('http://localhost/api/thai-address/districts?provinceCode=999999'))
    expect(res.status).toBe(200)
    expect((await res.json()).districts).toEqual([])
  })
})

describe('GET /api/thai-address/subdistricts', () => {
  it('returns [] when districtCode is missing', async () => {
    const res = await GET_SUBDISTRICTS(new NextRequest('http://localhost/api/thai-address/subdistricts'))
    expect((await res.json()).subdistricts).toEqual([])
  })

  it("returns only the requested district's subdistricts, each with its own postal_code, not the whole country", async () => {
    const districts = await GET_DISTRICTS(new NextRequest(`http://localhost/api/thai-address/districts?provinceCode=${BANGKOK_PROVINCE_CODE}`))
    const [firstDistrict] = (await districts.json()).districts
    const res = await GET_SUBDISTRICTS(new NextRequest(`http://localhost/api/thai-address/subdistricts?districtCode=${firstDistrict.code}`))
    const data = await res.json()
    expect(data.subdistricts.length).toBeGreaterThan(0)
    expect(data.subdistricts.length).toBeLessThan(100) // one district's worth, nowhere near the ~7,400 nationwide
    expect(data.subdistricts.every((s: { postal_code: string }) => /^\d{5}$/.test(s.postal_code))).toBe(true)
  })

  it('an unknown district code returns [] rather than throwing a 500', async () => {
    const res = await GET_SUBDISTRICTS(new NextRequest('http://localhost/api/thai-address/subdistricts?districtCode=999999'))
    expect(res.status).toBe(200)
    expect((await res.json()).subdistricts).toEqual([])
  })
})
