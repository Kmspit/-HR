'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAnnouncementStream } from '@/hooks/useAnnouncementStream'
import {
  Plus, Trash2, Archive, ArchiveRestore, Loader2, ChevronDown, X,
  Calendar, Users, Paperclip, Download, FileText, Image as ImageIcon,
  Edit2, Eye, Search, CheckSquare, Square,
} from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import type { Role } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────

type Attachment = {
  name: string; url: string; type: string; publicId?: string | null
}

type Announcement = {
  id: string; title: string; body: string; type: string
  targetType: string; targetIds: string[]
  publishAt: string; isRead: boolean; readCount: number
  createdById: string; createdAt: string; isArchived: boolean
  attachmentName: string | null; attachmentUrl: string | null
  attachmentType: string | null; attachmentPublicId: string | null
}

type OrgItem = { id: string; name: string }
type OrgData = {
  branches: OrgItem[]
  divisions: (OrgItem & { branchId: string })[]
  departments: (OrgItem & { divisionId: string })[]
  sections: (OrgItem & { departmentId: string })[]
}

type Employee = { id: string; name: string; employeeId: string; department: string; position: string }

type CreateForm = {
  title: string; body: string; type: string
  targetType: string; targetIds: string[]
  publishAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; bg: string; icon: string }> = {
  GENERAL:  { label: 'ทั่วไป',    bg: 'from-blue-600 to-blue-700',     icon: '📢' },
  PAYROLL:  { label: 'เงินเดือน', bg: 'from-green-600 to-emerald-700', icon: '💰' },
  HOLIDAY:  { label: 'วันหยุด',   bg: 'from-amber-500 to-orange-600',  icon: '🎌' },
  POLICY:   { label: 'นโยบาย',    bg: 'from-purple-600 to-violet-700', icon: '📋' },
  URGENT:   { label: 'ด่วน',      bg: 'from-red-600 to-rose-700',      icon: '🚨' },
}

const TARGET_LABELS: Record<string, string> = {
  ALL: 'ทุกคน', BRANCH: 'สาขา', DIVISION: 'ฝ่าย',
  DEPARTMENT: 'แผนก', SECTION: 'ส่วนงาน', INDIVIDUAL: 'รายบุคคล',
}

const TARGET_ORDER = ['ALL', 'BRANCH', 'DIVISION', 'DEPARTMENT', 'SECTION', 'INDIVIDUAL']

const EMPTY_FORM: CreateForm = {
  title: '', body: '', type: 'GENERAL', targetType: 'ALL', targetIds: [], publishAt: '',
}

function isImage(type: string | null) { return !!type?.startsWith('image/') }
function isPdf(type: string | null) { return type === 'application/pdf' }

function fileIcon(type: string | null) {
  if (isImage(type)) return <ImageIcon size={14} />
  if (isPdf(type)) return <FileText size={14} className="text-red-400" />
  return <FileText size={14} className="text-blue-400" />
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AnnouncementsClient({
  announcements: init, role, userId, orgData,
}: {
  announcements: Announcement[]; role: Role; userId: string; orgData: OrgData
}) {
  const isHR = role === 'MANAGER_HR' || role === 'ADMIN' || role === 'CEO'

  // ── Main list state
  const [items, setItems] = useState(init)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  // ── Pagination (load more)
  const [apiPage, setApiPage] = useState(1)
  const [hasMore, setHasMore] = useState(init.length >= 20)
  const [loadingMore, setLoadingMore] = useState(false)

  // ── Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // ── File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedAtt, setUploadedAtt] = useState<Attachment | null>(null)

  // ── Target entities
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [loadingEmps, setLoadingEmps] = useState(false)

  // ── File viewer modal
  const [viewer, setViewer] = useState<Attachment | null>(null)

  // ── Archive
  const [showArchive, setShowArchive] = useState(false)
  const [archive, setArchive] = useState<Announcement[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')

  // ── Real-time updates via shared NotificationStreamProvider SSE ─────────
  useAnnouncementStream(useCallback(async (data) => {
    if (data._deleted) {
      setItems((prev) => prev.filter((a) => a.id !== data.id))
      return
    }
    try {
      const { data: d } = await apiJson<{ announcements: Announcement[]; total?: number }>('/api/announcements')
      if (d?.announcements) {
        setItems(d.announcements)
        setApiPage(1)
        setHasMore((d.total ?? d.announcements.length) > d.announcements.length)
        if (!data._updated) {
          toast.info(`📢 ประกาศใหม่: ${String(data.title ?? '')}`, { duration: 5000 })
        }
      }
    } catch { /* ignore */ }
  }, []))

  // ── Load employees when INDIVIDUAL targeting selected ──────────────────
  useEffect(() => {
    if (form.targetType !== 'INDIVIDUAL' || !isHR) return
    setLoadingEmps(true)
    apiJson<{ employees: Employee[] }>('/api/warnings/employees')
      .then(({ data }) => setEmployees(data?.employees ?? []))
      .catch(() => {})
      .finally(() => setLoadingEmps(false))
  }, [form.targetType, isHR])

  // ── Computed values ────────────────────────────────────────────────────
  const currentAnn = items.filter((a) => !a.isArchived)
  const unreadCount = currentAnn.filter((a) => !a.isRead).length
  const displayed = filter === 'unread' ? currentAnn.filter((a) => !a.isRead) : currentAnn

  const filteredEmps = employees.filter(
    (e) => !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(empSearch.toLowerCase()),
  )

  // ── Helpers ────────────────────────────────────────────────────────────
  const setField = (k: keyof CreateForm, v: string | string[]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
    })

  const nowISO = new Date().toISOString().slice(0, 16)

  // ── File upload ────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/announcements/upload', { method: 'POST', body: fd })
      const data = await res.json() as { name: string; url: string; publicId: string; type: string; error?: string }
      if (!res.ok) { toast.error(data.error ?? 'อัปโหลดไม่สำเร็จ'); setUploadFile(null); return }
      setUploadedAtt({ name: data.name, url: data.url, type: data.type, publicId: data.publicId })
      toast.success('อัปโหลดไฟล์แล้ว')
    } catch {
      toast.error('อัปโหลดไม่สำเร็จ')
      setUploadFile(null)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = () => { setUploadedAtt(null); setUploadFile(null) }

  // ── Mark as read ───────────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    await apiJson(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true }),
    })
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
  }, [])

  const handleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id))
    const ann = items.find((a) => a.id === id)
    if (ann && !ann.isRead) markRead(id)
  }

  // ── Form open/close ────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setUploadedAtt(null)
    setUploadFile(null)
    setShowForm(true)
  }

  const openEdit = (ann: Announcement) => {
    setEditingId(ann.id)
    setForm({
      title: ann.title, body: ann.body, type: ann.type,
      targetType: ann.targetType, targetIds: ann.targetIds ?? [],
      publishAt: ann.publishAt ? ann.publishAt.slice(0, 16) : '',
    })
    setUploadedAtt(
      ann.attachmentUrl
        ? { name: ann.attachmentName ?? 'ไฟล์', url: ann.attachmentUrl, type: ann.attachmentType ?? '', publicId: ann.attachmentPublicId }
        : null,
    )
    setUploadFile(null)
    setShowForm(true)
    setExpanded(null)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setUploadedAtt(null)
    setUploadFile(null)
  }

  // ── Submit create/edit ─────────────────────────────────────────────────
  const submit = async () => {
    if (!form.title.trim()) { toast.error('กรุณาระบุหัวเรื่อง'); return }
    if (!form.body.trim()) { toast.error('กรุณาระบุเนื้อหา'); return }
    if (form.targetType !== 'ALL' && form.targetIds.length === 0) {
      toast.error('กรุณาเลือกกลุ่มเป้าหมายอย่างน้อย 1 รายการ'); return
    }
    setSubmitting(true)
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        targetType: form.targetType,
        targetIds: form.targetIds,
        publishAt: form.publishAt || new Date().toISOString(),
        attachmentName: uploadedAtt?.name ?? null,
        attachmentUrl: uploadedAtt?.url ?? null,
        attachmentType: uploadedAtt?.type ?? null,
        attachmentPublicId: uploadedAtt?.publicId ?? null,
      }

      if (editingId) {
        const { ok, data, status } = await apiJson(`/api/announcements/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
        toast.success('แก้ไขประกาศแล้ว')
      } else {
        const { ok, data, status } = await apiJson('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
        toast.success('ส่งประกาศแล้ว')
      }

      cancelForm()
      const { data: d2 } = await apiJson<{ announcements: Announcement[] }>('/api/announcements')
      setItems(d2?.announcements ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Archive / delete ───────────────────────────────────────────────────
  const toggleArchive = async (id: string, arc: boolean) => {
    const { ok } = await apiJson(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: arc }),
    })
    if (ok) {
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isArchived: arc } : a)))
      toast.success(arc ? 'ย้ายไป archive แล้ว' : 'กู้คืนแล้ว')
    }
  }

  const deleteAnn = async (id: string) => {
    if (!confirm('ลบประกาศนี้?')) return
    const { ok } = await apiJson(`/api/announcements/${id}`, { method: 'DELETE' })
    if (ok) { setItems((prev) => prev.filter((a) => a.id !== id)); toast.success('ลบแล้ว') }
  }

  // ── Load more ──────────────────────────────────────────────────────────
  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = apiPage + 1
      const { data } = await apiJson<{ announcements: Announcement[]; total?: number; pages?: number }>(
        `/api/announcements?page=${nextPage}&limit=20`,
      )
      if (data?.announcements?.length) {
        setItems((prev) => {
          const ids = new Set(prev.map((a) => a.id))
          return [...prev, ...data.announcements.filter((a) => !ids.has(a.id))]
        })
        setApiPage(nextPage)
        setHasMore(nextPage < (data.pages ?? 1))
      } else {
        setHasMore(false)
      }
    } catch { toast.error('โหลดเพิ่มเติมไม่สำเร็จ') }
    finally { setLoadingMore(false) }
  }

  // ── Archive loader ─────────────────────────────────────────────────────
  const loadArchive = async () => {
    setArchiveLoading(true)
    try {
      let url = '/api/announcements?archive=true'
      if (selectedMonth) { const [yr, mo] = selectedMonth.split('-'); url += `&year=${yr}&month=${mo}` }
      const { data } = await apiJson<{ announcements: Announcement[]; total?: number }>(url)
      setArchive(data?.announcements ?? [])
    } catch { toast.error('โหลดข้อมูล archive ไม่สำเร็จ') }
    finally { setArchiveLoading(false) }
  }

  const openArchive = () => { setShowArchive(true); loadArchive() }

  // ── Target toggle helpers ──────────────────────────────────────────────
  const toggleTargetId = (id: string) => {
    setForm((f) => ({
      ...f,
      targetIds: f.targetIds.includes(id)
        ? f.targetIds.filter((x) => x !== id)
        : [...f.targetIds, id],
    }))
  }

  const getTargetEntities = () => {
    switch (form.targetType) {
      case 'BRANCH':      return orgData.branches
      case 'DIVISION':    return orgData.divisions
      case 'DEPARTMENT':  return orgData.departments
      case 'SECTION':     return orgData.sections
      default:            return []
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 sm:p-4 md:p-5 space-y-5">

      {/* ── Active announcements card ── */}
      <div className="glass-card rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="px-4 md:px-5 py-3.5 border-b dark:border-white/[0.06] light:border-slate-200/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold dark:text-white light:text-slate-800 text-[15px]">ประกาศจากบริษัท</h2>
            {unreadCount > 0 && (
              <p className="text-[11px] text-blue-400 mt-0.5">ยังไม่อ่าน {unreadCount} รายการ</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter tabs (desktop) */}
            <div className="hidden sm:flex rounded-xl border dark:border-white/10 light:border-slate-200 overflow-hidden text-xs">
              {(['all', 'unread'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'dark:text-slate-400 light:text-slate-500 dark:hover:text-white light:hover:text-slate-700'}`}>
                  {f === 'all' ? 'ทั้งหมด' : `ยังไม่อ่าน${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                </button>
              ))}
            </div>
            {isHR && (
              <>
                <button onClick={openArchive}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500 text-xs hover:dark:bg-white/5 hover:light:bg-slate-50 transition-colors">
                  <Archive size={13} /> Archive
                </button>
                <button onClick={openCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
                  <Plus size={13} /> ส่งประกาศ
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Create / Edit Form ── */}
        {showForm && isHR && (
          <div className="px-4 md:px-5 py-4 border-b dark:border-white/[0.06] light:border-slate-200/60 dark:bg-blue-950/20 light:bg-blue-50/60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold dark:text-white light:text-slate-800">
                {editingId ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
              </h3>
              <button onClick={cancelForm} className="p-1 rounded-lg dark:text-slate-400 light:text-slate-500 hover:dark:text-white hover:light:text-slate-800">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Title */}
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">หัวเรื่อง *</label>
                <input value={form.title} onChange={(e) => setField('title', e.target.value)}
                  placeholder="หัวเรื่องประกาศ..."
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500" />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">เนื้อหา *</label>
                <textarea value={form.body} onChange={(e) => setField('body', e.target.value)}
                  rows={4} placeholder="รายละเอียดประกาศ..."
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              {/* Type + Target row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">ประเภท</label>
                  <select value={form.type} onChange={(e) => setField('type', e.target.value)}
                    className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-slate-800 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500">
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">กลุ่มเป้าหมาย</label>
                  <select value={form.targetType}
                    onChange={(e) => { setField('targetType', e.target.value); setField('targetIds', []); setEmpSearch('') }}
                    className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-slate-800 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500">
                    {TARGET_ORDER.map((k) => (
                      <option key={k} value={k}>{TARGET_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target entity picker */}
              {form.targetType !== 'ALL' && (
                <div className="rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-slate-50 p-3">
                  <p className="text-xs dark:text-slate-400 light:text-slate-500 mb-2 flex items-center gap-1">
                    <Users size={11} /> เลือก{TARGET_LABELS[form.targetType]}
                    {form.targetIds.length > 0 && <span className="ml-1 text-blue-400">({form.targetIds.length} เลือก)</span>}
                  </p>

                  {/* Individual: employee search */}
                  {form.targetType === 'INDIVIDUAL' ? (
                    <>
                      <div className="relative mb-2">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 dark:text-slate-500 light:text-slate-400" />
                        <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
                          placeholder="ค้นหาชื่อ / รหัสพนักงาน..."
                          className="w-full pl-7 pr-3 py-1.5 rounded-lg border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white text-xs dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500" />
                      </div>
                      {loadingEmps ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 size={14} className="animate-spin text-blue-400" />
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {filteredEmps.slice(0, 30).map((e) => {
                            const selected = form.targetIds.includes(e.id)
                            return (
                              <button key={e.id} onClick={() => toggleTargetId(e.id)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors
                                  ${selected ? 'dark:bg-blue-600/20 light:bg-blue-50 dark:text-blue-300 light:text-blue-700' : 'hover:dark:bg-white/5 hover:light:bg-white dark:text-slate-300 light:text-slate-700'}`}>
                                {selected ? <CheckSquare size={13} className="text-blue-400 flex-shrink-0" /> : <Square size={13} className="dark:text-slate-600 light:text-slate-400 flex-shrink-0" />}
                                <span className="truncate font-medium">{e.name}</span>
                                <span className="dark:text-slate-500 light:text-slate-400 flex-shrink-0">{e.employeeId}</span>
                              </button>
                            )
                          })}
                          {filteredEmps.length === 0 && (
                            <p className="text-center py-3 text-xs dark:text-slate-500 light:text-slate-400">ไม่พบพนักงาน</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Branch / Division / Department / Section checkboxes */
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {getTargetEntities().map((ent) => {
                        const selected = form.targetIds.includes(ent.id)
                        return (
                          <button key={ent.id} onClick={() => toggleTargetId(ent.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors
                              ${selected ? 'dark:bg-blue-600/20 light:bg-blue-50 dark:text-blue-300 light:text-blue-700' : 'hover:dark:bg-white/5 hover:light:bg-white dark:text-slate-300 light:text-slate-700'}`}>
                            {selected ? <CheckSquare size={13} className="text-blue-400 flex-shrink-0" /> : <Square size={13} className="dark:text-slate-600 light:text-slate-400 flex-shrink-0" />}
                            <span className="truncate">{ent.name}</span>
                          </button>
                        )
                      })}
                      {getTargetEntities().length === 0 && (
                        <p className="text-center py-3 text-xs dark:text-slate-500 light:text-slate-400">ไม่มีข้อมูล</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Publish time */}
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1 flex items-center gap-1">
                  <Calendar size={11} /> กำหนดเวลาเผยแพร่
                  <span className="opacity-50">(ว่างไว้ = เผยแพร่ทันที)</span>
                </label>
                <input type="datetime-local" value={form.publishAt} min={nowISO}
                  onChange={(e) => setField('publishAt', e.target.value)}
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500" />
              </div>

              {/* File attachment */}
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1 flex items-center gap-1">
                  <Paperclip size={11} /> แนบไฟล์ <span className="opacity-50">(PDF, Word, Excel, PNG, JPG, ZIP — สูงสุด 20 MB)</span>
                </label>
                {uploadedAtt ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white">
                    <span className="flex-shrink-0">{fileIcon(uploadedAtt.type)}</span>
                    <span className="text-xs dark:text-slate-300 light:text-slate-700 truncate flex-1">{uploadedAtt.name}</span>
                    <button onClick={removeAttachment} className="flex-shrink-0 p-1 rounded dark:text-slate-500 light:text-slate-400 hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={uploading}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed transition-colors cursor-pointer
                      ${uploading ? 'border-blue-500/50 dark:bg-blue-500/5' : 'dark:border-white/10 light:border-slate-300 hover:dark:border-white/20 hover:light:border-slate-400'}`}>
                      {uploading ? (
                        <><Loader2 size={13} className="animate-spin text-blue-400" /><span className="text-xs dark:text-slate-400 light:text-slate-500">กำลังอัปโหลด...</span></>
                      ) : (
                        <><Paperclip size={13} className="dark:text-slate-500 light:text-slate-400" /><span className="text-xs dark:text-slate-400 light:text-slate-500">คลิกเพื่อเลือกไฟล์หรือลากวาง</span></>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button onClick={cancelForm}
                  className="flex-1 py-2.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500 text-sm hover:dark:bg-white/5 hover:light:bg-slate-50 transition-colors">
                  ยกเลิก
                </button>
                <button onClick={submit} disabled={submitting || uploading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                  {editingId ? 'บันทึก' : 'ส่งประกาศ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── List ── */}
        <div className="divide-y dark:divide-white/[0.04] light:divide-slate-100">
          {displayed.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-3xl mb-2">📢</p>
              <p className="text-sm dark:text-slate-500 light:text-slate-400">ไม่มีประกาศ</p>
            </div>
          ) : (
            displayed.map((ann) => {
              const cfg = TYPE_CONFIG[ann.type] ?? TYPE_CONFIG.GENERAL
              const isExpanded = expanded === ann.id
              const hasAttachment = !!ann.attachmentUrl
              return (
                <div key={ann.id} className={`transition-colors ${!ann.isRead ? 'dark:bg-blue-500/[0.03] light:bg-blue-50/40' : ''}`}>
                  <button onClick={() => handleExpand(ann.id)}
                    className="w-full text-left px-4 md:px-5 py-4 flex items-start gap-3">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base bg-gradient-to-br ${cfg.bg}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-[13px] font-semibold leading-snug ${ann.isRead ? 'dark:text-slate-300 light:text-slate-600' : 'dark:text-white light:text-slate-800'}`}>
                          {ann.title}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!ann.isRead && <div className="w-2 h-2 bg-blue-400 rounded-full" />}
                          <ChevronDown size={14} className={`dark:text-slate-500 light:text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      {!isExpanded && (
                        <p className="mt-0.5 text-[11px] dark:text-slate-400 light:text-slate-500 line-clamp-1">{ann.body}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] dark:text-slate-500 light:text-slate-400">{formatDate(ann.publishAt)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r ${cfg.bg} text-white/90`}>{cfg.label}</span>
                        {hasAttachment && (
                          <span className="text-[10px] dark:text-slate-500 light:text-slate-400 flex items-center gap-0.5">
                            <Paperclip size={9} /> ไฟล์แนบ
                          </span>
                        )}
                        {isHR && (
                          <span className="text-[10px] dark:text-slate-600 light:text-slate-400 flex items-center gap-0.5">
                            <Users size={9} /> {ann.readCount} คนอ่านแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 md:px-5 pb-4">
                      <div className="ml-12 space-y-3">
                        <p className="text-sm dark:text-slate-300 light:text-slate-700 leading-relaxed whitespace-pre-wrap">{ann.body}</p>

                        {/* Attachment */}
                        {hasAttachment && (
                          <AttachmentView
                            name={ann.attachmentName ?? 'ไฟล์'}
                            url={ann.attachmentUrl!}
                            type={ann.attachmentType ?? ''}
                            onPreview={() => setViewer({ name: ann.attachmentName ?? 'ไฟล์', url: ann.attachmentUrl!, type: ann.attachmentType ?? '' })}
                          />
                        )}

                        {/* HR actions */}
                        {isHR && (
                          <div className="flex items-center gap-3 pt-2 border-t dark:border-white/[0.06] light:border-slate-100 flex-wrap">
                            <span className="text-xs dark:text-slate-500 light:text-slate-400">
                              เป้าหมาย: {TARGET_LABELS[ann.targetType] ?? ann.targetType}
                              {ann.targetIds?.length > 0 && ` (${ann.targetIds.length})`}
                            </span>
                            <button onClick={() => openEdit(ann)}
                              className="flex items-center gap-1 text-xs dark:text-slate-400 light:text-slate-500 hover:text-blue-400 transition-colors">
                              <Edit2 size={11} /> แก้ไข
                            </button>
                            <button onClick={() => toggleArchive(ann.id, true)}
                              className="flex items-center gap-1 text-xs dark:text-slate-400 light:text-slate-500 hover:text-amber-400 transition-colors">
                              <Archive size={11} /> Archive
                            </button>
                            <button onClick={() => deleteAnn(ann.id)}
                              className="flex items-center gap-1 text-xs dark:text-slate-400 light:text-slate-500 hover:text-red-400 transition-colors">
                              <Trash2 size={11} /> ลบ
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Load more */}
        {hasMore && filter === 'all' && (
          <div className="px-4 py-3 border-t dark:border-white/[0.06] light:border-slate-100 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 text-xs font-medium dark:text-slate-400 light:text-slate-500 hover:dark:text-white hover:light:text-slate-800 transition-colors disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />}
              {loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
            </button>
          </div>
        )}

        {/* Mobile bottom bar */}
        {(unreadCount > 0 || isHR) && (
          <div className="sm:hidden px-4 py-3 border-t dark:border-white/[0.06] light:border-slate-100 flex items-center gap-2">
            <button onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors border ${filter === 'unread' ? 'bg-blue-600 border-blue-600 text-white' : 'dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500'}`}>
              {filter === 'unread' ? 'ดูทั้งหมด' : `ยังไม่อ่าน${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
            </button>
            {isHR && (
              <button onClick={openArchive}
                className="py-2.5 px-3 rounded-xl border dark:border-white/10 light:border-slate-200 text-xs dark:text-slate-400 light:text-slate-500 flex items-center gap-1">
                <Archive size={12} /> Archive
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── File Viewer Modal ── */}
      {viewer && (
        <FileViewer attachment={viewer} onClose={() => setViewer(null)} />
      )}

      {/* ── Archive Modal ── */}
      {showArchive && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowArchive(false)}>
          <div className="w-full sm:max-w-lg max-h-[80dvh] sm:max-h-[70vh] rounded-t-2xl sm:rounded-2xl dark:bg-slate-900 light:bg-white border dark:border-white/10 light:border-slate-200 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b dark:border-white/[0.06] light:border-slate-100 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
              <h3 className="text-sm font-semibold dark:text-white light:text-slate-800 flex items-center gap-2">
                <Archive size={15} /> ประกาศ Archive
              </h3>
              <div className="flex items-center gap-2">
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-2 py-1 text-xs dark:text-white light:text-slate-800 focus:outline-none" />
                <button onClick={loadArchive}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
                  ค้นหา
                </button>
                <button onClick={() => setShowArchive(false)} className="p-1 rounded-lg dark:text-slate-400 light:text-slate-500">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {archiveLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              ) : archive.length === 0 ? (
                <div className="py-10 text-center dark:text-slate-500 light:text-slate-400 text-sm">ไม่มีประกาศ archive</div>
              ) : (
                <div className="divide-y dark:divide-white/[0.04] light:divide-slate-100">
                  {archive.map((ann) => {
                    const cfg = TYPE_CONFIG[ann.type] ?? TYPE_CONFIG.GENERAL
                    return (
                      <div key={ann.id} className="px-4 py-3 flex items-start gap-3">
                        <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium dark:text-white light:text-slate-800 leading-snug">{ann.title}</p>
                          <p className="text-[11px] dark:text-slate-400 light:text-slate-500 line-clamp-2 mt-0.5">{ann.body}</p>
                          <p className="text-[10px] dark:text-slate-600 light:text-slate-400 mt-0.5">{formatDate(ann.publishAt)}</p>
                        </div>
                        {isHR && (
                          <button onClick={() => { toggleArchive(ann.id, false); setArchive((p) => p.filter((a) => a.id !== ann.id)) }}
                            className="p-1.5 rounded-lg dark:text-slate-500 light:text-slate-400 hover:text-blue-400 transition-colors flex-shrink-0"
                            title="กู้คืน">
                            <ArchiveRestore size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AttachmentView component ───────────────────────────────────────────────

function AttachmentView({ name, url, type, onPreview }: {
  name: string; url: string; type: string; onPreview: () => void
}) {
  const canPreview = isImage(type) || isPdf(type)
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-slate-50">
      <span className="flex-shrink-0">{fileIcon(type)}</span>
      <span className="text-xs dark:text-slate-300 light:text-slate-700 truncate flex-1">{name}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {canPreview && (
          <button onClick={onPreview}
            className="flex items-center gap-1 text-[11px] dark:text-slate-400 light:text-slate-500 hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:dark:bg-white/5">
            <Eye size={11} /> ดู
          </button>
        )}
        <a href={url} download={name} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] dark:text-slate-400 light:text-slate-500 hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:dark:bg-white/5">
          <Download size={11} /> ดาวน์โหลด
        </a>
      </div>
    </div>
  )
}

// ── FileViewer modal ───────────────────────────────────────────────────────

function FileViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const isPdfFile = isPdf(attachment.type)
  const isImageFile = isImage(attachment.type)

  return (
    <div className="fixed inset-0 z-60 flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/40" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          {fileIcon(attachment.type)}
          <span className="text-sm text-white/90 truncate">{attachment.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}>
            <Download size={13} /> ดาวน์โหลด
          </a>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {isPdfFile && (
          <iframe src={attachment.url} className="w-full h-full rounded-xl border border-white/10" title={attachment.name} />
        )}
        {isImageFile && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.url} alt={attachment.name}
            className="max-w-full max-h-full object-contain rounded-xl"
            style={{ maxHeight: 'calc(100dvh - 80px)' }} />
        )}
        {!isPdfFile && !isImageFile && (
          <div className="text-center">
            <FileText size={48} className="text-white/40 mx-auto mb-4" />
            <p className="text-white/70 text-sm mb-4">{attachment.name}</p>
            <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
              <Download size={15} /> ดาวน์โหลดไฟล์
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
