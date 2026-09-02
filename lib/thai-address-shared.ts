/**
 * Client-safe pieces of the Thai-address feature — types and a plain string
 * constant, nothing that imports `geothai`. Deliberately split out of
 * lib/thai-address.ts: that file imports geothai, which reads its data via
 * `node:fs` at runtime and cannot be bundled for the browser at all. The
 * first version of this feature imported lib/thai-address.ts directly from
 * ThaiAddressFields.tsx ('use client') just for these types/constant, and
 * webpack still pulled the whole module graph — including geothai's `fs`
 * import — into the client bundle, breaking the build
 * (UnhandledSchemeError: node:fs). Any type or constant a client component
 * needs belongs in THIS file; anything that calls into geothai belongs only
 * in lib/thai-address.ts, imported only by the app/api/thai-address/* routes.
 */

export type ThaiProvinceOption = { code: string; name_th: string }
export type ThaiDistrictOption = { code: string; name_th: string }
export type ThaiSubdistrictOption = { code: string; name_th: string; postal_code: string }

/** Bangkok's province code — the one case where district/subdistrict labels
 *  are "เขต"/"แขวง" instead of "อำเภอ"/"ตำบล". geothai's data carries no such
 *  flag itself; this is the single source of truth the UI checks against. */
export const BANGKOK_PROVINCE_CODE = '10'
