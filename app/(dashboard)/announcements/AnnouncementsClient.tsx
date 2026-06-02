'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Archive, ArchiveRestore, Loader2, ChevronDown, X, Calendar, Users } from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import type { Role } from '@prisma/client'

type Announcement = {
  id: string
  title: string
  body: string
  type: string
  targetType: string
  publishAt: string
  isRead: boolean
  readCount: number
  createdById: string
  createdAt: string
  isArchived: boolean
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; icon: string }> = {
  GENERAL:  { label: 'ทั่วไป',      bg: 'from-blue-600 to-blue-700',    icon: '📢' },
  PAYROLL:  { label: 'เงินเดือน',   bg: 'from-green-600 to-emerald-700', icon: '💰' },
  HOLIDAY:  { label: 'วันหยุด',     bg: 'from-amber-500 to-orange-600',  icon: '🎌' },
  POLICY:   { label: 'นโยบาย',      bg: 'from-purple-600 to-violet-700', icon: '📋' },
  URGENT:   { label: 'ด่วน',        bg: 'from-red-600 to-rose-700',      icon: '🚨' },
}

const TARGET_LABELS: Record<string, string> = {
  ALL: 'ทุกคน', DEPARTMENT: 'แผนก', BRANCH: 'สาขา', INDIVIDUAL: 'รายบุคคล',
}

const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

type CreateForm = {
  title: string
  body: string
  type: string
  targetType: string
  publishAt: string
}

const EMPTY_FORM: CreateForm = {
  title: '', body: '', type: 'GENERAL', targetType: 'ALL', publishAt: '',
}

export default function AnnouncementsClient({
  announcements: init,
  role,
  userId,
}: {
  announcements: Announcement[]
  role: Role
  userId: string
}) {
  const isHR = role === 'MANAGER_HR' || role === 'ADMIN'

  const [items, setItems] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [archive, setArchive] = useState<Announcement[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const setField = (k: keyof CreateForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const currentAnn = items.filter((a) => !a.isArchived)
  const unreadCount = currentAnn.filter((a) => !a.isRead).length
  const displayed = filter === 'unread' ? currentAnn.filter((a) => !a.isRead) : currentAnn

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

  const submit = async () => {
    if (!form.title.trim()) { toast.error('กรุณาระบุหัวเรื่อง'); return }
    if (!form.body.trim()) { toast.error('กรุณาระบุเนื้อหา'); return }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        publishAt: form.publishAt || new Date().toISOString(),
      }
      const { ok, data, status } = await apiJson('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success('ส่งประกาศแล้ว')
      setShowForm(false)
      setForm(EMPTY_FORM)
      // Refresh list
      const { data: d2 } = await apiJson<{ announcements: Announcement[] }>('/api/announcements')
      setItems(d2.announcements ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleArchive = async (id: string, archive: boolean) => {
    const { ok } = await apiJson(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: archive }),
    })
    if (ok) {
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isArchived: archive } : a)))
      toast.success(archive ? 'ย้ายไป archive แล้ว' : 'กู้คืนแล้ว')
    }
  }

  const deleteAnn = async (id: string) => {
    if (!confirm('ลบประกาศนี้?')) return
    const { ok } = await apiJson(`/api/announcements/${id}`, { method: 'DELETE' })
    if (ok) { setItems((prev) => prev.filter((a) => a.id !== id)); toast.success('ลบแล้ว') }
  }

  const loadArchive = async () => {
    setArchiveLoading(true)
    try {
      let url = '/api/announcements?archive=true'
      if (selectedMonth) {
        const [yr, mo] = selectedMonth.split('-')
        url += `&year=${yr}&month=${mo}`
      }
      const { data } = await apiJson<{ announcements: Announcement[] }>(url)
      setArchive(data.announcements ?? [])
    } catch {
      toast.error('โหลดข้อมูล archive ไม่สำเร็จ')
    } finally {
      setArchiveLoading(false)
    }
  }

  const openArchive = () => {
    setShowArchive(true)
    loadArchive()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const nowISO = new Date().toISOString().slice(0, 16)

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Active announcements */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-5 py-4 border-b dark:border-white/[0.06] light:border-slate-200/60 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold dark:text-white light:text-slate-800 text-[15px]">ประกาศจากบริษัท</h2>
            {unreadCount > 0 && (
              <p className="text-[11px] text-blue-400 mt-0.5">ยังไม่อ่าน {unreadCount} รายการ</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Filter tabs */}
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
                <button
                  onClick={openArchive}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500 text-xs hover:dark:bg-white/5 hover:light:bg-slate-50 transition-colors"
                >
                  <Archive size={13} /> Archive
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                >
                  <Plus size={13} /> ส่งประกาศ
                </button>
              </>
            )}
          </div>
        </div>

        {/* Create form */}
        {showForm && isHR && (
          <div className="px-4 md:px-5 py-4 border-b dark:border-white/[0.06] light:border-slate-200/60 dark:bg-blue-950/20 light:bg-blue-50/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold dark:text-white light:text-slate-800">สร้างประกาศใหม่</h3>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                className="p-1 rounded-lg dark:text-slate-400 light:text-slate-500 dark:hover:text-white light:hover:text-slate-800">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">หัวเรื่อง *</label>
                <input
                  value={form.title} onChange={(e) => setField('title', e.target.value)}
                  placeholder="หัวเรื่องประกาศ..."
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">เนื้อหา *</label>
                <textarea
                  value={form.body} onChange={(e) => setField('body', e.target.value)}
                  rows={3} placeholder="รายละเอียดประกาศ..."
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">ประเภท</label>
                <select value={form.type} onChange={(e) => setField('type', e.target.value)}
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-slate-800 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1">กลุ่มเป้าหมาย</label>
                <select value={form.targetType} onChange={(e) => setField('targetType', e.target.value)}
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-slate-800 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500">
                  {Object.entries(TARGET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs dark:text-slate-400 light:text-slate-500 block mb-1 flex items-center gap-1">
                  <Calendar size={11} /> กำหนดเวลาเผยแพร่ <span className="opacity-50">(ว่างไว้ = เผยแพร่ทันที)</span>
                </label>
                <input type="datetime-local" value={form.publishAt} min={nowISO}
                  onChange={(e) => setField('publishAt', e.target.value)}
                  className="w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-3 py-2 text-sm dark:text-white light:text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                className="flex-1 py-2 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500 text-sm hover:dark:bg-white/5 hover:light:bg-slate-50 transition-colors">
                ยกเลิก
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                ส่งประกาศ
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="divide-y dark:divide-white/[0.04] light:divide-slate-100">
          {displayed.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">📢</p>
              <p className="text-sm dark:text-slate-500 light:text-slate-400">ไม่มีประกาศ</p>
            </div>
          ) : (
            displayed.map((ann) => {
              const cfg = TYPE_CONFIG[ann.type] ?? TYPE_CONFIG.GENERAL
              const isExpanded = expanded === ann.id
              return (
                <div key={ann.id} className={`transition-colors ${!ann.isRead ? 'dark:bg-blue-500/[0.03] light:bg-blue-50/40' : ''}`}>
                  <button
                    onClick={() => handleExpand(ann.id)}
                    className="w-full text-left px-4 md:px-5 py-4 flex items-start gap-3"
                  >
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
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] dark:text-slate-500 light:text-slate-400">{formatDate(ann.publishAt)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r ${cfg.bg} text-white/90`}>{cfg.label}</span>
                        {isHR && (
                          <span className="text-[10px] dark:text-slate-600 light:text-slate-400 flex items-center gap-0.5">
                            <Users size={9} /> {ann.readCount} คนอ่านแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 md:px-5 pb-4">
                      <div className="ml-12">
                        <p className="text-sm dark:text-slate-300 light:text-slate-700 leading-relaxed whitespace-pre-wrap">{ann.body}</p>
                        {isHR && (
                          <div className="mt-3 flex items-center gap-2 pt-3 border-t dark:border-white/[0.06] light:border-slate-100">
                            <span className="text-xs dark:text-slate-500 light:text-slate-400">
                              เป้าหมาย: {TARGET_LABELS[ann.targetType] ?? ann.targetType}
                            </span>
                            <span className="dark:text-slate-600 light:text-slate-300">·</span>
                            <button
                              onClick={() => toggleArchive(ann.id, true)}
                              className="flex items-center gap-1 text-xs dark:text-slate-400 light:text-slate-500 hover:text-amber-400 transition-colors"
                            >
                              <Archive size={12} /> Archive
                            </button>
                            <button
                              onClick={() => deleteAnn(ann.id)}
                              className="flex items-center gap-1 text-xs dark:text-slate-400 light:text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} /> ลบ
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

        {/* Mobile filter + archive */}
        {(unreadCount > 0 || isHR) && (
          <div className="sm:hidden px-4 py-3 border-t dark:border-white/[0.06] light:border-slate-100 flex items-center gap-2">
            <button onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors border ${filter === 'unread' ? 'bg-blue-600 border-blue-600 text-white' : 'dark:border-white/10 light:border-slate-200 dark:text-slate-400 light:text-slate-500'}`}>
              {filter === 'unread' ? 'ดูทั้งหมด' : `ยังไม่อ่าน (${unreadCount})`}
            </button>
            {isHR && (
              <button onClick={openArchive}
                className="py-2 px-3 rounded-xl border dark:border-white/10 light:border-slate-200 text-xs dark:text-slate-400 light:text-slate-500 flex items-center gap-1">
                <Archive size={12} /> Archive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Archive Modal */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowArchive(false)}>
          <div className="w-full sm:max-w-lg max-h-[80dvh] sm:max-h-[70vh] rounded-t-2xl sm:rounded-2xl dark:bg-slate-900 light:bg-white border dark:border-white/10 light:border-slate-200 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b dark:border-white/[0.06] light:border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold dark:text-white light:text-slate-800 flex items-center gap-2">
                <Archive size={15} /> ประกาศ Archive
              </h3>
              <div className="flex items-center gap-2">
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border dark:border-white/10 light:border-slate-200 dark:bg-white/5 light:bg-white px-2 py-1 text-xs dark:text-white light:text-slate-800 focus:outline-none"
                />
                <button onClick={loadArchive} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
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
                          <button
                            onClick={() => { toggleArchive(ann.id, false); setArchive((p) => p.filter((a) => a.id !== ann.id)) }}
                            className="p-1.5 rounded-lg dark:text-slate-500 light:text-slate-400 hover:text-blue-400 transition-colors flex-shrink-0"
                            title="กู้คืน"
                          >
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
