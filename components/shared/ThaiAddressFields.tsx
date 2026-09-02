'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import { BANGKOK_PROVINCE_CODE, type ThaiProvinceOption, type ThaiDistrictOption, type ThaiSubdistrictOption } from '@/lib/thai-address-shared'

export type ThaiAddressValue = {
  province: string
  amphoe: string
  tambon: string
  postalCode: string
}

export type ThaiAddressErrors = Partial<Record<'province' | 'amphoe' | 'tambon', string>>

// Module-level cache — RegisterForm/EmployeeProfileTab both render this
// component TWICE on one page (current + registered address). Provinces
// never change at runtime, so fetch once per page load, not once per
// mounted instance.
let provincesCache: Promise<ThaiProvinceOption[]> | null = null
function fetchProvincesCached(): Promise<ThaiProvinceOption[]> {
  if (!provincesCache) {
    provincesCache = apiJson<{ provinces: ThaiProvinceOption[] }>('/api/thai-address/provinces')
      .then((res) => (res.ok ? res.data.provinces : []))
      .catch(() => [])
  }
  return provincesCache
}

/**
 * Cascading province -> district -> subdistrict combobox, shared by
 * RegisterForm.tsx and EmployeeProfileTab.tsx (Thai-address-dropdown plan,
 * approved 2026-09-02) — replaces 3 free-text inputs that produced
 * non-standard values ("กรุงเทพมหานคร"/"กทม."/"กรุงเทพฯ" all meaning the
 * same place) with a closed vocabulary sourced from the `geothai` package,
 * fetched through app/api/thai-address/* (server-only — see lib/thai-address.ts's
 * header comment for why this never imports geothai directly).
 *
 * `value` still stores plain name strings (province/amphoe/tambon), same as
 * before — no schema change. This component only constrains what those
 * strings CAN be going forward; it doesn't retroactively touch already-
 * stored free-text. A stored value that doesn't exactly match a real
 * name_th (typo'd, or an old "กทม." style entry) is shown as an unresolved
 * mismatch (see MismatchHint below) rather than silently dropped or auto-
 * corrected — the old value stays in the field/DB until the admin
 * deliberately picks a real option.
 */
export default function ThaiAddressFields({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string
  value: ThaiAddressValue
  onChange: (next: ThaiAddressValue) => void
  errors?: ThaiAddressErrors
}) {
  const [provinces, setProvinces] = useState<ThaiProvinceOption[]>([])
  const [provincesLoaded, setProvincesLoaded] = useState(false)
  const [districts, setDistricts] = useState<ThaiDistrictOption[]>([])
  const [districtsLoading, setDistrictsLoading] = useState(false)
  const [subdistricts, setSubdistricts] = useState<ThaiSubdistrictOption[]>([])
  const [subdistrictsLoading, setSubdistrictsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchProvincesCached().then((list) => {
      if (!cancelled) { setProvinces(list); setProvincesLoaded(true) }
    })
    return () => { cancelled = true }
  }, [])

  const matchedProvince = provinces.find((p) => p.name_th === value.province) ?? null
  const provinceMismatch = provincesLoaded && value.province.trim() !== '' && !matchedProvince

  // Load districts whenever the resolved province code changes (not on
  // every keystroke — only once a real province is matched).
  const provinceCodeRef = useRef<string | null>(null)
  useEffect(() => {
    const code = matchedProvince?.code ?? null
    if (code === provinceCodeRef.current) return
    provinceCodeRef.current = code
    if (!code) { setDistricts([]); return }
    setDistrictsLoading(true)
    apiJson<{ districts: ThaiDistrictOption[] }>(`/api/thai-address/districts?provinceCode=${code}`)
      .then((res) => setDistricts(res.ok ? res.data.districts : []))
      .finally(() => setDistrictsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedProvince?.code])

  const matchedDistrict = districts.find((d) => d.name_th === value.amphoe) ?? null
  const districtMismatch = districts.length > 0 && value.amphoe.trim() !== '' && !matchedDistrict

  const districtCodeRef = useRef<string | null>(null)
  useEffect(() => {
    const code = matchedDistrict?.code ?? null
    if (code === districtCodeRef.current) return
    districtCodeRef.current = code
    if (!code) { setSubdistricts([]); return }
    setSubdistrictsLoading(true)
    apiJson<{ subdistricts: ThaiSubdistrictOption[] }>(`/api/thai-address/subdistricts?districtCode=${code}`)
      .then((res) => setSubdistricts(res.ok ? res.data.subdistricts : []))
      .finally(() => setSubdistrictsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedDistrict?.code])

  const matchedSubdistrict = subdistricts.find((s) => s.name_th === value.tambon) ?? null
  const subdistrictMismatch = subdistricts.length > 0 && value.tambon.trim() !== '' && !matchedSubdistrict

  const isBangkok = matchedProvince?.code === BANGKOK_PROVINCE_CODE
  const districtLabel = isBangkok ? 'เขต' : 'อำเภอ'
  const subdistrictLabel = isBangkok ? 'แขวง' : 'ตำบล'

  const selectProvince = (opt: ThaiProvinceOption | null) => {
    onChange({ province: opt?.name_th ?? '', amphoe: '', tambon: '', postalCode: '' })
  }
  const selectDistrict = (opt: ThaiDistrictOption | null) => {
    onChange({ ...value, amphoe: opt?.name_th ?? '', tambon: '', postalCode: '' })
  }
  const selectSubdistrict = (opt: ThaiSubdistrictOption | null) => {
    onChange({ ...value, tambon: opt?.name_th ?? '', postalCode: opt?.postal_code ?? '' })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <AddressCombobox
        id={`${idPrefix}-province`}
        label="จังหวัด"
        required
        value={value.province}
        options={provinces}
        loading={!provincesLoaded}
        error={errors?.province}
        mismatchHint={provinceMismatch ? `ค่าเดิม: "${value.province}" ไม่ตรงกับรายการ กรุณาเลือกใหม่` : undefined}
        onSelect={selectProvince}
      />
      <AddressCombobox
        id={`${idPrefix}-amphoe`}
        label={districtLabel}
        required
        value={value.amphoe}
        options={districts}
        disabled={!matchedProvince}
        loading={districtsLoading}
        error={errors?.amphoe}
        mismatchHint={districtMismatch ? `ค่าเดิม: "${value.amphoe}" ไม่ตรงกับรายการ กรุณาเลือกใหม่` : undefined}
        placeholder={!matchedProvince ? 'เลือกจังหวัดก่อน' : undefined}
        onSelect={selectDistrict}
      />
      <AddressCombobox
        id={`${idPrefix}-tambon`}
        label={subdistrictLabel}
        required
        value={value.tambon}
        options={subdistricts}
        disabled={!matchedDistrict}
        loading={subdistrictsLoading}
        error={errors?.tambon}
        mismatchHint={subdistrictMismatch ? `ค่าเดิม: "${value.tambon}" ไม่ตรงกับรายการ กรุณาเลือกใหม่` : undefined}
        placeholder={!matchedDistrict ? `เลือก${districtLabel}ก่อน` : undefined}
        onSelect={selectSubdistrict}
      />
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-postal`} className="text-xs text-white/50 block">
          รหัสไปรษณีย์
        </label>
        <input
          id={`${idPrefix}-postal`}
          value={value.postalCode}
          readOnly
          placeholder="เติมอัตโนมัติจากตำบล/แขวง"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white/70 text-sm outline-none cursor-not-allowed"
        />
      </div>
    </div>
  )
}

type ComboOption = { code: string; name_th: string }

function AddressCombobox<T extends ComboOption>({
  id, label, required, value, options, disabled, loading, error, mismatchHint, placeholder, onSelect,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  options: T[]
  disabled?: boolean
  loading?: boolean
  error?: string
  mismatchHint?: string
  placeholder?: string
  onSelect: (opt: T | null) => void
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-sync displayed text from the parent's canonical value whenever it
  // changes externally (cascade reset, initial load) — but not while the
  // user is actively typing/open, so a keystroke never gets clobbered.
  useEffect(() => {
    if (!open) setQuery(value)
  }, [value, open])

  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current) }, [])

  const filtered = query.trim()
    ? options.filter((o) => o.name_th.includes(query.trim()))
    : options

  const handleBlur = () => {
    // Delay so a click on a dropdown option (which also blurs the input)
    // still registers before we discard unselected typed text.
    blurTimerRef.current = setTimeout(() => {
      setOpen(false)
      setQuery(value) // revert anything typed that was never actually selected
    }, 150)
  }

  const pick = (opt: T) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    onSelect(opt)
    setQuery(opt.name_th)
    setOpen(false)
  }

  return (
    <div className="space-y-1.5 relative">
      <label htmlFor={id} className="text-xs text-white/50 block">
        {label}{required ? <span className="text-red-400/90 ml-0.5">*</span> : null}
      </label>
      <div className="relative">
        <input
          id={id}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-white text-sm outline-none transition disabled:opacity-40 disabled:cursor-not-allowed ${error ? 'border-red-500/50' : 'border-white/10 focus:border-green-500'}`}
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40 absolute right-3 top-1/2 -translate-y-1/2" />}
        {open && !disabled && filtered.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 shadow-xl">
            {filtered.slice(0, 100).map((opt) => (
              <li key={opt.code}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  {opt.name_th}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && mismatchHint && <p className="text-[11px] text-amber-400">{mismatchHint}</p>}
    </div>
  )
}
