'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import { BANGKOK_PROVINCE_CODE, type ThaiProvinceOption, type ThaiDistrictOption, type ThaiSubdistrictOption } from '@/lib/thai-address-shared'

export type ThaiAddressValue = {
  province: string
  amphoe: string
  tambon: string
  postalCode: string
}

export type ThaiAddressErrors = Partial<Record<'province' | 'amphoe' | 'tambon', string>>

type LoadState<T> = { phase: 'loading' } | { phase: 'error' } | { phase: 'loaded'; data: T[] }
const LOADING: LoadState<never> = { phase: 'loading' }

// Module-level cache — RegisterForm/EmployeeProfileTab both render this
// component TWICE on one page (current + registered address). Provinces
// never change at runtime, so fetch once per page load, not once per
// mounted instance. A failed fetch is NOT cached (provincesCache reset to
// null) so every mounted instance's retry button — or a fresh page load —
// gets a real new attempt instead of replaying a stale failure.
let provincesCache: Promise<ThaiProvinceOption[]> | null = null
function fetchProvincesCached(): Promise<ThaiProvinceOption[]> {
  if (!provincesCache) {
    provincesCache = apiJson<{ provinces: ThaiProvinceOption[] }>('/api/thai-address/provinces')
      .then((res) => {
        if (!res.ok) { provincesCache = null; throw new Error('provinces fetch failed') }
        return res.data.provinces
      })
      .catch((err) => { provincesCache = null; throw err })
  }
  return provincesCache
}

/**
 * Cascading province -> district -> subdistrict combobox, shared by
 * RegisterForm.tsx and EmployeeProfileTab.tsx (Thai-address-dropdown plan,
 * approved 2026-09-02) — replaces 3 free-text inputs that produced
 * non-standard values ("กรุงเทพมหานคร"/"กทม."/"กรุงเทพฯ" all meaning the
 * same place) with a closed vocabulary, fetched through app/api/thai-address/*
 * (server-only — see lib/thai-address.ts's header comment for why this
 * never imports geothai directly, and for the Vercel deployment issue that
 * made a visible load-failure state here necessary in the first place: a
 * bundling problem meant this fetch silently failed on the deployed
 * preview, and the combobox showing an empty list with no explanation was
 * genuinely indistinguishable from "you typed something that doesn't
 * exist" — same class of bug as the history tab's stuck-loading spinner
 * before that got a proper load-state machine. Every level below now has
 * its own loading/error/loaded state and a visible retry button instead of
 * silently resolving to an empty options list on failure).
 *
 * `value` still stores plain name strings (province/amphoe/tambon), same as
 * before — no schema change. This component only constrains what those
 * strings CAN be going forward; it doesn't retroactively touch already-
 * stored free-text. A stored value that doesn't exactly match a real
 * name_th (typo'd, or an old "กทม." style entry) is shown as an unresolved
 * mismatch (see mismatchHint below) rather than silently dropped or auto-
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
  const [provincesState, setProvincesState] = useState<LoadState<ThaiProvinceOption>>(LOADING)
  const [districtsState, setDistrictsState] = useState<LoadState<ThaiDistrictOption>>({ phase: 'loaded', data: [] })
  const [subdistrictsState, setSubdistrictsState] = useState<LoadState<ThaiSubdistrictOption>>({ phase: 'loaded', data: [] })

  const loadProvinces = () => {
    setProvincesState(LOADING)
    fetchProvincesCached()
      .then((data) => setProvincesState({ phase: 'loaded', data }))
      .catch(() => setProvincesState({ phase: 'error' }))
  }
  useEffect(loadProvinces, [])

  const provinces = provincesState.phase === 'loaded' ? provincesState.data : []
  const matchedProvince = provinces.find((p) => p.name_th === value.province) ?? null
  const provinceMismatch = provincesState.phase === 'loaded' && value.province.trim() !== '' && !matchedProvince

  // Load districts whenever the resolved province code changes (not on
  // every keystroke — only once a real province is matched).
  const provinceCodeRef = useRef<string | null>(null)
  const loadDistricts = (code: string) => {
    setDistrictsState(LOADING)
    apiJson<{ districts: ThaiDistrictOption[] }>(`/api/thai-address/districts?provinceCode=${code}`)
      .then((res) => {
        if (!res.ok) throw new Error('districts fetch failed')
        setDistrictsState({ phase: 'loaded', data: res.data.districts })
      })
      .catch(() => setDistrictsState({ phase: 'error' }))
  }
  useEffect(() => {
    const code = matchedProvince?.code ?? null
    if (code === provinceCodeRef.current) return
    provinceCodeRef.current = code
    if (!code) { setDistrictsState({ phase: 'loaded', data: [] }); return }
    loadDistricts(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedProvince?.code])

  const districts = districtsState.phase === 'loaded' ? districtsState.data : []
  const matchedDistrict = districts.find((d) => d.name_th === value.amphoe) ?? null
  const districtMismatch = districtsState.phase === 'loaded' && districts.length > 0 && value.amphoe.trim() !== '' && !matchedDistrict

  const districtCodeRef = useRef<string | null>(null)
  const loadSubdistricts = (code: string) => {
    setSubdistrictsState(LOADING)
    apiJson<{ subdistricts: ThaiSubdistrictOption[] }>(`/api/thai-address/subdistricts?districtCode=${code}`)
      .then((res) => {
        if (!res.ok) throw new Error('subdistricts fetch failed')
        setSubdistrictsState({ phase: 'loaded', data: res.data.subdistricts })
      })
      .catch(() => setSubdistrictsState({ phase: 'error' }))
  }
  useEffect(() => {
    const code = matchedDistrict?.code ?? null
    if (code === districtCodeRef.current) return
    districtCodeRef.current = code
    if (!code) { setSubdistrictsState({ phase: 'loaded', data: [] }); return }
    loadSubdistricts(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedDistrict?.code])

  const subdistricts = subdistrictsState.phase === 'loaded' ? subdistrictsState.data : []
  const matchedSubdistrict = subdistricts.find((s) => s.name_th === value.tambon) ?? null
  const subdistrictMismatch = subdistrictsState.phase === 'loaded' && subdistricts.length > 0 && value.tambon.trim() !== '' && !matchedSubdistrict

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
        loading={provincesState.phase === 'loading'}
        loadFailed={provincesState.phase === 'error'}
        loadErrorMessage="โหลดข้อมูลจังหวัดไม่สำเร็จ กรุณาลองใหม่"
        onRetry={loadProvinces}
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
        loading={districtsState.phase === 'loading'}
        loadFailed={districtsState.phase === 'error'}
        loadErrorMessage={`โหลดข้อมูล${districtLabel}ไม่สำเร็จ กรุณาลองใหม่`}
        onRetry={matchedProvince ? () => loadDistricts(matchedProvince.code) : undefined}
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
        loading={subdistrictsState.phase === 'loading'}
        loadFailed={subdistrictsState.phase === 'error'}
        loadErrorMessage={`โหลดข้อมูล${subdistrictLabel}ไม่สำเร็จ กรุณาลองใหม่`}
        onRetry={matchedDistrict ? () => loadSubdistricts(matchedDistrict.code) : undefined}
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
  id, label, required, value, options, disabled, loading, loadFailed, loadErrorMessage, onRetry, error, mismatchHint, placeholder, onSelect,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  options: T[]
  disabled?: boolean
  loading?: boolean
  /** The fetch for this level's options failed — shown as its own message
   *  with a retry button, distinct from "loading" or "no matches for your
   *  search," so the admin never has to guess why the list is empty. */
  loadFailed?: boolean
  loadErrorMessage?: string
  onRetry?: () => void
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
          className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-white text-sm outline-none transition disabled:opacity-40 disabled:cursor-not-allowed ${error || loadFailed ? 'border-red-500/50' : 'border-white/10 focus:border-green-500'}`}
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40 absolute right-3 top-1/2 -translate-y-1/2" />}
        {open && !disabled && !loadFailed && filtered.length > 0 && (
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
      {loadFailed && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{loadErrorMessage ?? 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่'}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
            >
              <RotateCcw className="w-3 h-3" /> ลองใหม่
            </button>
          )}
        </div>
      )}
      {!loadFailed && error && <p className="text-xs text-red-400">{error}</p>}
      {!loadFailed && !error && mismatchHint && <p className="text-[11px] text-amber-400">{mismatchHint}</p>}
    </div>
  )
}
