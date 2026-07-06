'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

export type DeletedRequestItem = {
  id: string
  date: string
  place: string
  purpose: string
  documentNumber: string | null
  deletedAt: string
  clientCompanyName: string | null
  requesterName: string
  deletedByName: string | null
}

function fmtDateTH(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`
}

function fmtDateTimeTH(iso: string): string {
  const d = new Date(iso)
  return `${fmtDateTH(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function DeletedRequestsList({ initialItems }: { initialItems: DeletedRequestItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState<DeletedRequestItem[]>(initialItems)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const restore = async (id: string) => {
    if (!window.confirm('กู้คืนรายการนี้กลับมาแสดงในระบบ?')) return
    setRestoringId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/outside-work/${id}/restore`, { method: 'POST' })
      if (!ok) { toast.error(apiErrorMessage(data, 'กู้คืนไม่สำเร็จ', status)); return }
      setItems((prev) => prev.filter((it) => it.id !== id))
      toast.success('กู้คืนรายการแล้ว')
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-3 max-w-4xl">
      {items.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-white/40">ไม่มีรายการที่ถูกลบ</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-slate-500 dark:text-white/40">{item.documentNumber ?? '—'}</span>
                <span className="font-medium text-slate-900 dark:text-white">{fmtDateTH(item.date)}</span>
                {item.clientCompanyName && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 text-xs font-semibold">
                    {item.clientCompanyName}
                  </span>
                )}
                <span className="text-slate-500 dark:text-white/50">ผู้ขอ: {item.requesterName}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-white/70 truncate">{item.place} — {item.purpose}</p>
              <p className="text-xs px-2 py-0.5 inline-block rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                ลบโดย {item.deletedByName ?? 'ไม่ทราบ'} เมื่อ {fmtDateTimeTH(item.deletedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => restore(item.id)}
              disabled={restoringId === item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition disabled:opacity-50 shrink-0"
            >
              {restoringId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              กู้คืน
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
