'use client'

import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import {
  OVERRIDE_ELIGIBLE_PATHS,
  OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES,
  type OverrideEligiblePath,
} from '@/lib/override-eligible-paths'
import type { Role } from '@prisma/client'

export type PagePermissionOverrideRow = {
  path: OverrideEligiblePath
  direction: 'GRANT' | 'RESTRICT'
  reason: string | null
}

type Direction = 'NONE' | 'GRANT' | 'RESTRICT'

const PATH_LABELS: Record<OverrideEligiblePath, string> = {
  '/payroll': 'เงินเดือน',
  '/reports': 'รายงานรายเดือน',
  '/executive': 'CEO Command Center',
}

/**
 * Per-user page-access overrides (2026-10-02) — lets HR grant a specific
 * employee access to a page their role would normally deny, or restrict one
 * their role would normally allow, for the small curated set of pages in
 * lib/override-eligible-paths.ts. Self-contained save (own endpoint, own
 * button), same pattern as SecurityDepositSection.tsx in this same tab.
 *
 * Only rendered when the viewer is in OVERRIDE_MANAGER_ROLES (server-
 * computed in page.tsx, passed down) and never for isSelf — enforced again
 * server-side in PUT /api/users/[id]/page-permissions regardless.
 */
export default function PagePermissionOverridesSection({
  userId,
  employeeRole,
  viewerRole,
  initialOverrides,
}: {
  userId: string
  employeeRole: Role
  /** The editor's own role — 2026-10-06 security review addition. A GRANT
   *  the editor's own role doesn't have by default is hidden here (server
   *  hard-blocks it regardless, PUT /api/users/[id]/page-permissions) so the
   *  editor never sees a button that would just 403 on submit. */
  viewerRole: Role
  initialOverrides: PagePermissionOverrideRow[]
}) {
  const initial = Object.fromEntries(
    OVERRIDE_ELIGIBLE_PATHS.map((path) => {
      const row = initialOverrides.find((o) => o.path === path)
      return [path, { direction: (row?.direction ?? 'NONE') as Direction, reason: row?.reason ?? '' }]
    }),
  ) as Record<OverrideEligiblePath, { direction: Direction; reason: string }>

  const [state, setState] = useState(initial)
  const [saving, setSaving] = useState(false)

  const setDirection = (path: OverrideEligiblePath, direction: Direction) =>
    setState((s) => ({ ...s, [path]: { ...s[path], direction } }))
  const setReason = (path: OverrideEligiblePath, reason: string) =>
    setState((s) => ({ ...s, [path]: { ...s[path], reason } }))

  const save = async () => {
    setSaving(true)
    const overrides = OVERRIDE_ELIGIBLE_PATHS.filter((path) => state[path].direction !== 'NONE').map((path) => ({
      path,
      direction: state[path].direction,
      reason: state[path].reason.trim() || null,
    }))
    const { ok, data, status } = await apiJson<{ overrides?: unknown }>(
      `/api/users/${userId}/page-permissions`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }) },
    )
    if (ok) {
      toast.success('บันทึกสิทธิ์เฉพาะบุคคลแล้ว')
    } else {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
    }
    setSaving(false)
  }

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4 border border-amber-500/15">
      <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
        <KeyRound className="w-4 h-4 text-amber-400" /> สิทธิ์เฉพาะบุคคล (เหนือกว่า Role)
      </h2>
      <p className="text-[12px] text-white/40">
        กำหนดสิทธิ์เข้าถึงหน้าเฉพาะพนักงานคนนี้ แตกต่างจากคนอื่นที่มี Role เดียวกัน — มีผลเฉพาะหน้าที่เลือกไว้ด้านล่างเท่านั้น
      </p>

      {OVERRIDE_ELIGIBLE_PATHS.map((path) => {
        const roleDefaultAllowed = OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES[path].includes(employeeRole)
        const viewerCanGrantThisPath = OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES[path].includes(viewerRole)
        const row = state[path]
        return (
          <div key={path} className="space-y-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-white/80">
              {PATH_LABELS[path]} <span className="text-[11px] text-white/30">({path})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDirection(path, 'NONE')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
                  row.direction === 'NONE' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                ตามสิทธิ์เดิม
              </button>
              {!roleDefaultAllowed && viewerCanGrantThisPath && (
                <button
                  type="button"
                  onClick={() => setDirection(path, 'GRANT')}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
                    row.direction === 'GRANT' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  อนุญาตเพิ่ม
                </button>
              )}
              {roleDefaultAllowed && (
                <button
                  type="button"
                  onClick={() => setDirection(path, 'RESTRICT')}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
                    row.direction === 'RESTRICT' ? 'bg-red-500/30 text-red-300' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  ปิดกั้น
                </button>
              )}
            </div>
            {row.direction !== 'NONE' && (
              <input
                value={row.reason}
                onChange={(e) => setReason(path, e.target.value)}
                placeholder="เหตุผล (ไม่บังคับ)"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30"
              />
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin inline mr-1" />}
        บันทึกสิทธิ์เฉพาะบุคคล
      </button>
    </section>
  )
}
