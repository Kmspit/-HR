'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Send, Pencil, Trash2, X } from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { PRODUCT_CATEGORY_KEYS, OTHER_PRODUCT_CATEGORY, productTypesFor } from '@/lib/constants/product-types'

export type ClientVisitItem = {
  id: string
  date: string
  timeSlot: string | null
  place: string
  purpose: string
  caseNumber: string | null
  productCategory: string | null
  productType: string | null
  caseCount: number | null
  status: string
  approvalStatus: string | null
  documentNumber: string | null
}

type Draft = {
  date: string
  timeSlot: 'เช้า' | 'บ่าย' | ''
  place: string
  purpose: string
  caseNumber: string
  productCategory: string
  productType: string
  caseCount: string
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyDraft(): Draft {
  return {
    date: todayYmd(), timeSlot: '',
    place: '', purpose: '', caseNumber: '', productCategory: '', productType: '', caseCount: '',
  }
}

function fmtDateTH(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`
}

function isPendingItem(item: Pick<ClientVisitItem, 'status' | 'approvalStatus'>): boolean {
  if (item.status === 'APPROVED' || item.status === 'REJECTED') return false
  return item.status === 'PENDING' || item.approvalStatus === 'pending_ceo' || item.approvalStatus === 'pending_chain'
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รออนุมัติ', pending_ceo: 'รออนุมัติ', pending_chain: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว', approved_by_ceo: 'อนุมัติแล้ว', approved: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ', rejected_by_ceo: 'ไม่อนุมัติ', rejected: 'ไม่อนุมัติ',
}

const INPUT_CLS = 'w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:border-green-500'

export default function ClientVisitCompanyForm({
  companyId, companyName, initialItems,
}: {
  companyId: string
  companyName: string
  initialItems: ClientVisitItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<ClientVisitItem[]>(initialItems)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { setItems(initialItems) }, [initialItems])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const draftTypes = useMemo(() => productTypesFor(draft.productCategory), [draft.productCategory])
  const isOtherCategory = draft.productCategory === OTHER_PRODUCT_CATEGORY

  const startEdit = (item: ClientVisitItem) => {
    setEditingId(item.id)
    setDraft({
      date: item.date.slice(0, 10),
      timeSlot: (item.timeSlot === 'บ่าย' ? 'บ่าย' : 'เช้า'),
      place: item.place,
      purpose: item.purpose,
      caseNumber: item.caseNumber ?? '',
      productCategory: item.productCategory ?? '',
      productType: item.productType ?? '',
      caseCount: item.caseCount != null ? String(item.caseCount) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const submit = async () => {
    if (!draft.date)            { toast.error('กรุณาเลือกวันที่'); return }
    if (!draft.timeSlot)        { toast.error('กรุณาเลือกช่วงเวลา'); return }
    if (!draft.place.trim())    { toast.error('กรุณาระบุสถานที่'); return }
    if (!draft.purpose.trim())  { toast.error('กรุณาระบุสิ่งที่ไปดำเนินการ'); return }

    setSaving(true)
    try {
      const body = {
        date: draft.date,
        timeSlot: draft.timeSlot,
        clientCompanyId: companyId,
        place: draft.place.trim(),
        purpose: draft.purpose.trim(),
        caseNumber: draft.caseNumber.trim() || null,
        productCategory: draft.productCategory || null,
        productType: draft.productType || null,
        caseCount: draft.caseCount ? Number(draft.caseCount) : null,
      }
      const url    = editingId ? `/api/outside-work/${editingId}` : '/api/outside-work'
      const method = editingId ? 'PATCH' : 'POST'
      const { ok, data, status } = await apiJson<{ request?: ClientVisitItem }>(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }

      toast.success(editingId ? 'แก้ไขรายการแล้ว' : 'บันทึกสำเร็จ — ส่งเข้าขั้นตอนอนุมัติแล้ว')
      cancelEdit()
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('ลบรายการนี้ (ยังกู้คืนได้ทาง admin)')) return
    setDeletingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/outside-work/${id}`, { method: 'DELETE' })
      if (!ok) { toast.error(apiErrorMessage(data, 'ลบไม่สำเร็จ', status)); return }
      setItems((prev) => prev.filter((it) => it.id !== id))
      toast.success('ลบรายการแล้ว')
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      {/* ── Form card ── */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            {editingId ? 'แก้ไขรายการ' : `บันทึกรายการใหม่ — ${companyName}`}
          </h2>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="flex items-center gap-1 text-xs text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80">
              <X className="w-3.5 h-3.5" /> ยกเลิกแก้ไข
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">วันที่ *</label>
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">ช่วงเวลา *</label>
            <select value={draft.timeSlot} onChange={(e) => set('timeSlot', e.target.value as Draft['timeSlot'])} className={INPUT_CLS}>
              <option value="">— เลือกช่วงเวลา —</option>
              <option value="เช้า">เช้า</option>
              <option value="บ่าย">บ่าย</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">สถานที่ *</label>
          <input value={draft.place} onChange={(e) => set('place', e.target.value)} placeholder="สถานที่ไปทำงาน..." className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">สิ่งที่ไปดำเนินการ *</label>
          <input value={draft.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="รายละเอียด..." className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">หมายเลขคดี (ถ้ามี)</label>
          <input value={draft.caseNumber} onChange={(e) => set('caseNumber', e.target.value)} placeholder="ไม่บังคับ..." className={INPUT_CLS} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">งานโปรดักส์</label>
            <select
              value={draft.productCategory}
              onChange={(e) => { set('productCategory', e.target.value); set('productType', '') }}
              className={INPUT_CLS}
            >
              <option value="">— ไม่ระบุ —</option>
              {PRODUCT_CATEGORY_KEYS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">ประเภทย่อย</label>
            {isOtherCategory ? (
              <input value={draft.productType} onChange={(e) => set('productType', e.target.value)} placeholder="ระบุประเภท..." className={INPUT_CLS} />
            ) : (
              <select value={draft.productType} onChange={(e) => set('productType', e.target.value)} disabled={!draft.productCategory} className={`${INPUT_CLS} disabled:opacity-50`}>
                <option value="">— เลือกประเภทย่อย —</option>
                {draftTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">จำนวนคดี</label>
          <input type="number" min="0" value={draft.caseCount} onChange={(e) => set('caseCount', e.target.value)} placeholder="ไม่บังคับ..." className={INPUT_CLS} />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {editingId ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </section>

      {/* ── List of submitted items (card, not table) — scoped to this company only ── */}
      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900 dark:text-white">รายการสัปดาห์นี้ — {companyName} ({items.length})</h2>
        {items.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-white/40">ยังไม่มีรายการในสัปดาห์นี้สำหรับบริษัทนี้</p>
        )}
        {items.map((item) => {
          const canEdit = isPendingItem(item)
          return (
            <div key={item.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-slate-500 dark:text-white/40">{item.documentNumber ?? '—'}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{fmtDateTH(item.date)}</span>
                    <span className="text-slate-500 dark:text-white/50">({item.timeSlot ?? '—'})</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/60 text-xs font-semibold">
                      {STATUS_LABEL[item.approvalStatus ?? item.status] ?? item.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-white/70 truncate">{item.place} — {item.purpose}</p>
                  {(item.caseNumber || item.productCategory) && (
                    <p className="text-xs text-slate-400 dark:text-white/40">
                      {item.caseNumber && <>คดี {item.caseNumber} </>}
                      {item.productCategory && <>· {item.productCategory}{item.productType ? ` > ${item.productType}` : ''}</>}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => startEdit(item)} title="แก้ไข" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/50 transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(item.id)} disabled={deletingId === item.id} title="ลบ" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition disabled:opacity-40">
                      {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
