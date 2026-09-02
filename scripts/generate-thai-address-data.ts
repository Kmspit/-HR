/**
 * One-time (re-runnable) generator — flattens geothai's nested province/
 * district/subdistrict tree into 3 static JSON files checked into the repo
 * under data/thai-address/. Run with: npx tsx scripts/generate-thai-address-data.ts
 *
 * Why this exists: the original design called geothai's functions directly
 * from app/api/thai-address/* at request time. geothai reads its own data
 * via fs.readFileSync() at a path computed from import.meta.url — Vercel's
 * Node File Trace didn't reliably get those files into the Lambda bundle
 * (outputFileTracingIncludes correctly listed them in the local .nft.json
 * trace, but the province dropdown still came back empty on the deployed
 * preview — most likely because geothai's own runtime path computation
 * doesn't resolve correctly inside Vercel's actual Lambda filesystem
 * layout, a documented class of issue with import.meta.url-based path
 * resolution on Vercel — see the commit message for citations. Not
 * confirmed via direct Lambda log access, since every preview URL on this
 * project is behind Vercel's own SSO wall).
 *
 * Static JSON files imported directly by lib/thai-address.ts sidestep the
 * whole problem: a literal `import x from './foo.json'` is fully
 * statically analyzable, so webpack bundles the JSON directly into the
 * route's own compiled output — no separate file, no runtime path
 * computation, nothing for a tracer to miss.
 *
 * Re-run this script only if geothai's upstream data changes (new
 * districts/subdistricts, postal code corrections) — genuinely rare for
 * Thai administrative geography.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAllProvinces, getAllDistricts, getAllSubdistricts } from 'geothai'

const OUT_DIR = join(__dirname, '..', 'data', 'thai-address')
mkdirSync(OUT_DIR, { recursive: true })

const provinces = getAllProvinces().map((p) => ({ code: String(p.code), name_th: p.name_th }))

const districts = getAllDistricts().map((d) => ({
  code: String(d.code), name_th: d.name_th, province_code: String(d.province_code),
}))

const subdistricts = getAllSubdistricts().map((s) => ({
  code: String(s.code), name_th: s.name_th, district_code: String(s.district_code), postal_code: String(s.postal_code),
}))

writeFileSync(join(OUT_DIR, 'provinces.json'), JSON.stringify(provinces))
writeFileSync(join(OUT_DIR, 'districts.json'), JSON.stringify(districts))
writeFileSync(join(OUT_DIR, 'subdistricts.json'), JSON.stringify(subdistricts))

console.log(`Wrote ${provinces.length} provinces, ${districts.length} districts, ${subdistricts.length} subdistricts to ${OUT_DIR}`)
