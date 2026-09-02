import { getAllProvinces, getDistrictsByCriterion, getSubdistrictsByCriterion } from 'geothai'
import type { ThaiProvinceOption, ThaiDistrictOption, ThaiSubdistrictOption } from '@/lib/thai-address-shared'

/**
 * Server-only wrapper around the `geothai` package — import this ONLY from
 * the app/api/thai-address/* route handlers, never from a 'use client'
 * component (not even for its types — see lib/thai-address-shared.ts's
 * header comment for why that alone broke the client build once already).
 * geothai's data is one fully denormalized nested tree (each Province
 * carries its Districts, each District carries its Subdistricts — ~7,400
 * subdistricts nationwide, ~6MB unpacked, read via `node:fs` at runtime,
 * which cannot be bundled for the browser at all); importing it client-side
 * would both ship that whole tree in the browser bundle AND fail the
 * webpack build outright. Instead, the 3 API routes call these functions
 * server-side and return only the small slice the client actually asked
 * for (see this repo's Thai-address-dropdown plan, approved 2026-09-02) —
 * province list once, districts for one province, subdistricts for one
 * district. Always strip geothai's own nested children arrays before
 * returning — a District object still carries its full subdistricts[]
 * internally, which would defeat the whole point if passed straight through.
 */

export function listThaiProvinces(): ThaiProvinceOption[] {
  return getAllProvinces().map((p) => ({ code: String(p.code), name_th: p.name_th }))
}

export function listThaiDistricts(provinceCode: string): ThaiDistrictOption[] {
  const code = Number(provinceCode)
  if (!Number.isInteger(code)) return []
  return getDistrictsByCriterion({ province_code: code }).map((d) => ({ code: String(d.code), name_th: d.name_th }))
}

export function listThaiSubdistricts(districtCode: string): ThaiSubdistrictOption[] {
  const code = Number(districtCode)
  if (!Number.isInteger(code)) return []
  return getSubdistrictsByCriterion({ district_code: code }).map((s) => ({
    code: String(s.code), name_th: s.name_th, postal_code: String(s.postal_code),
  }))
}
