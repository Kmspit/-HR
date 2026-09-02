import type { ThaiProvinceOption, ThaiDistrictOption, ThaiSubdistrictOption } from '@/lib/thai-address-shared'
import provincesData from '@/data/thai-address/provinces.json'
import districtsData from '@/data/thai-address/districts.json'
import subdistrictsData from '@/data/thai-address/subdistricts.json'

/**
 * Server-only — import this ONLY from the app/api/thai-address/* route
 * handlers, never from a 'use client' component (not even for its types —
 * see lib/thai-address-shared.ts's header comment for why that alone broke
 * the client build once already).
 *
 * Originally called the `geothai` npm package directly at request time.
 * geothai reads its own data via fs.readFileSync() at a path computed from
 * import.meta.url — that worked locally and in `next build`'s own trace
 * output (each route's generated route.js.nft.json under .next/server/app/
 * api/thai-address/ correctly listed geothai's data files after adding an
 * outputFileTracingIncludes entry), but the deployed Vercel preview still
 * returned an empty province list. Most likely explanation (not confirmed
 * via direct Lambda log access — every preview URL on this project sits
 * behind Vercel's own SSO wall, which blocked both curl and `vercel logs`
 * from this environment):
 * import.meta.url-derived path resolution is a documented class of issue
 * on Vercel — files can be correctly traced/bundled and still not be found
 * at the path a package computes for itself at runtime, because Vercel's
 * actual Lambda filesystem layout doesn't necessarily mirror the local
 * node_modules layout that the relative-path math assumes (see e.g.
 * https://github.com/vercel/next.js/issues/55523 and reports of ENOENT at
 * /var/task/... paths for import.meta.url-based file reads).
 *
 * Fix: these 3 JSON files (data/thai-address/*.json, generated once by
 * scripts/generate-thai-address-data.ts and checked into the repo, not
 * node_modules) are imported here as ordinary static imports. That's fully
 * statically analyzable — webpack inlines the JSON directly into this
 * route's own compiled output, so there's no separate file and no runtime
 * path computation for a tracer (or Vercel's Lambda layout) to get wrong.
 */

export function listThaiProvinces(): ThaiProvinceOption[] {
  return provincesData
}

export function listThaiDistricts(provinceCode: string): ThaiDistrictOption[] {
  if (!provinceCode) return []
  return districtsData
    .filter((d) => d.province_code === provinceCode)
    .map((d) => ({ code: d.code, name_th: d.name_th }))
}

export function listThaiSubdistricts(districtCode: string): ThaiSubdistrictOption[] {
  if (!districtCode) return []
  return subdistrictsData
    .filter((s) => s.district_code === districtCode)
    .map((s) => ({ code: s.code, name_th: s.name_th, postal_code: s.postal_code }))
}
