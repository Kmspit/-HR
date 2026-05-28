'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle, XCircle, Search, Layers, Pencil } from 'lucide-react'
import OrgAssignModal from '@/components/dashboard/OrgAssignModal'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { ROLE_LABELS, ROLE_COLORS, ROLE_ICONS } from '@/lib/permissions'
import type { Role } from '@prisma/client'

type User = {
  id: string; name: string; email: string; employeeId: string | null
  role: Role; status: string; department: string | null; position: string | null
  phone: string | null; baseSalary: number | null; socialSecurity: boolean
  startDate: string | null; lineId: string | null; isCoworker: boolean; createdAt: string
  branch?: { name: string; code: string } | null
  branchId?: string | null
  divisionId?: string | null
  departmentId?: string | null
  sectionId?: string | null
  division?: { name: string; code: string } | null
  orgDepartment?: { name: string; code: string } | null
  section?: { name: string; code: string } | null
}

type OrgOpt = { id: string; name: string; code?: string; divisionId?: string; departmentId?: string }

type Props = {
  users: User[]
  stats: { total: number; pending: number; active: number; disabled: number }
  initialTab: string
  orgFilterOptions?: { divisions: OrgOpt[]; departments: OrgOpt[]; sections: OrgOpt[] }
  currentOrgFilters?: { divisionId?: string; departmentId?: string; sectionId?: string }
}

function orgLabel(u: User) {
  if (u.division && u.orgDepartment) {
    return u.section
      ? `${u.division.name} / ${u.orgDepartment.name} / ${u.section.name}`
      : `${u.division.name} / ${u.orgDepartment.name}`
  }
  if (u.department) return u.department
  return '— ยังไม่กำหนด'
}

export default function EmployeeManager({ users, stats, initialTab, orgFilterOptions, currentOrgFilters }: Props) {
  const [tab, setTab] = useState<'all' | 'pending' | 'disabled'>(initialTab === 'pending' ? 'pending' : 'all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [assignUser, setAssignUser] = useState<User | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setOrgFilter = (key: 'divisionId' | 'departmentId' | 'sectionId', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === 'all') params.delete(key)
    else params.set(key, value)
    if (key === 'divisionId') { params.delete('departmentId'); params.delete('sectionId') }
    if (key === 'departmentId') params.delete('sectionId')
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }

  const sel = (key: 'divisionId' | 'departmentId' | 'sectionId') => currentOrgFilters?.[key] ?? ''

  const filtered = users.filter((u) => {
    const matchTab = tab === 'all' ? u.status === 'ACTIVE' || u.status === 'DISABLED' : tab === 'pending' ? u.status === 'PENDING' : u.status === 'DISABLED'
    if (tab === 'all') {
      const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || (u.department ?? '').toLowerCase().includes(search.toLowerCase())
      return u.status === 'ACTIVE' && matchSearch
    }
    return matchTab
  })

  const handleApprove = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setLoading(id)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success(action === 'APPROVE' ? '✅ อนุมัติบัญชีแล้ว' : '❌ ปฏิเสธบัญชีแล้ว')
      router.refresh()
    } catch (err) {
      console.error('[employee-approve]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
    finally { setLoading(null) }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { ACTIVE: 'text-green-400 bg-green-500/10', PENDING: 'text-yellow-400 bg-yellow-500/10', DISABLED: 'text-slate-400 bg-slate-500/10', REJECTED: 'text-red-400 bg-red-500/10' }
    const label: Record<string, string> = { ACTIVE: 'Active', PENDING: 'รอ Approve', DISABLED: 'ระงับ', REJECTED: 'ปฏิเสธ' }
    return <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${map[s] ?? 'text-slate-400 bg-slate-700'}`}>{label[s] ?? s}</span>
  }

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-full overflow-x-hidden">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: stats.active, color: 'text-green-400' },
          { label: 'รออนุมัติ', value: stats.pending, color: 'text-yellow-400' },
          { label: 'ระงับ', value: stats.disabled, color: 'text-slate-400' },
          { label: 'ทั้งหมด', value: stats.total, color: 'text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/5 bg-slate-900 p-4 text-center">
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {orgFilterOptions && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">ฝ่าย</label>
            <select value={sel('divisionId') || 'all'} onChange={(e) => setOrgFilter('divisionId', e.target.value)} className="mt-0.5 w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white">
              <option value="all">ทุกฝ่าย</option>
              {orgFilterOptions.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">แผนก</label>
            <select value={sel('departmentId') || 'all'} onChange={(e) => setOrgFilter('departmentId', e.target.value)} className="mt-0.5 w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white">
              <option value="all">ทุกแผนก</option>
              {orgFilterOptions.departments.filter((d) => !sel('divisionId') || d.divisionId === sel('divisionId')).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">ส่วนงาน</label>
            <select value={sel('sectionId') || 'all'} onChange={(e) => setOrgFilter('sectionId', e.target.value)} className="mt-0.5 w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-xs text-white">
              <option value="all">ทุกส่วนงาน</option>
              {orgFilterOptions.sections.filter((s) => !sel('departmentId') || s.departmentId === sel('departmentId')).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5 overflow-x-auto max-w-full">
          {[
            { id: 'all' as const, label: `ทั้งหมด (${stats.active})` },
            { id: 'pending' as const, label: `รออนุมัติ (${stats.pending})` },
            { id: 'disabled' as const, label: `ระงับ (${stats.disabled})` },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all min-h-[40px] ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
        {tab === 'all' && (
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="ค้นหาชื่อ, อีเมล, แผนก..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 py-2 pl-8 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" />
          </div>
        )}
      </div>

      {/* รออนุมัติ — การ์ดมือถือ (ปุ่มใต้ชื่อ/ตำแหน่ง) */}
      {tab === 'pending' && (
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีบัญชีรออนุมัติ ✅</div>
          ) : filtered.map((u) => (
            <div key={`card-${u.id}`} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-sm font-bold text-blue-400">{u.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{u.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{u.position ?? '—'} · {u.department ?? '—'}</p>
                  <p className="text-[10px] text-cyan-400/80 truncate">{u.branch ? `${u.branch.name} (${u.branch.code})` : '—'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                </div>
                {statusBadge(u.status)}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(u.id, 'APPROVE')}
                  disabled={loading === u.id}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 touch-manipulation"
                >
                  {loading === u.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  อนุมัติ
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(u.id, 'REJECT')}
                  disabled={loading === u.id}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 touch-manipulation"
                >
                  <XCircle size={14} />
                  ปฏิเสธ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className={`rounded-2xl border border-white/5 bg-slate-900 overflow-hidden ${tab === 'pending' ? 'hidden md:block' : ''}`}>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['พนักงาน', 'ฝ่าย/แผนก/ส่วนงาน', 'สาขา', 'Role', 'สถานะ', 'เริ่มงาน', 'ประกันสังคม', 'การดำเนินการ'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">ไม่มีข้อมูล</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-400">{u.name[0]}</div>
                      <div>
                        <p className="font-semibold text-white">{u.name}</p>
                        <p className="text-[10px] text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px]">
                    <p className="truncate" title={orgLabel(u)}>{orgLabel(u)}</p>
                    {(!u.divisionId || !u.departmentId) && u.status === 'ACTIVE' && (
                      <span className="text-amber-400 text-[10px]">รอกำหนดฝ่าย/แผนก</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{u.branch ? `${u.branch.name} (${u.branch.code})` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[u.role]}`}>{ROLE_ICONS[u.role]} {ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(u.status)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{u.startDate ? formatThaiDate(u.startDate) : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${u.socialSecurity ? 'text-green-400 bg-green-500/10' : 'text-slate-400 bg-slate-700'}`}>{u.socialSecurity ? 'อยู่' : 'ไม่อยู่'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {tab === 'pending' && (
                        <>
                          <button type="button" onClick={() => handleApprove(u.id, 'APPROVE')} disabled={loading === u.id} className="flex min-h-[36px] items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-500 disabled:opacity-50 touch-manipulation">
                            {loading === u.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} อนุมัติ
                          </button>
                          <button type="button" onClick={() => handleApprove(u.id, 'REJECT')} disabled={loading === u.id} className="flex min-h-[36px] items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50 touch-manipulation">
                            <XCircle size={12} /> ปฏิเสธ
                          </button>
                        </>
                      )}
                      <Link
                        href={`/employees/${u.id}`}
                        className="flex min-h-[36px] items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 touch-manipulation"
                      >
                        <Pencil size={12} /> แก้ไข
                      </Link>
                      <button type="button" onClick={() => setAssignUser(u)} className="flex min-h-[36px] items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300 hover:bg-blue-500/20 touch-manipulation">
                        <Layers size={12} /> กำหนดฝ่าย/แผนก
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assignUser && (
        <OrgAssignModal
          userId={assignUser.id}
          userName={assignUser.name}
          branchId={assignUser.branchId ?? null}
          onClose={() => setAssignUser(null)}
        />
      )}
    </div>
  )
}
