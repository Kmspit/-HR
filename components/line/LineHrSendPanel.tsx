'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Loader2, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type EmployeeOption = {
  id: string
  name: string
  department: string | null
  employeeId: string | null
  linked: boolean
  lineDisplayName: string | null
}

type LineMeta = {
  configured: boolean
  hasChannelSecret: boolean
  hasAccessToken: boolean
  webhookUrl: string
  linkedCount: number
  totalActive: number
  employees: EmployeeOption[]
}

type TargetMode = 'one' | 'all'

export default function LineHrSendPanel({
  compact,
  initialUserId,
}: {
  compact?: boolean
  initialUserId?: string
}) {
  const [meta, setMeta] = useState<LineMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetMode, setTargetMode] = useState<TargetMode>('one')
  const [userId, setUserId] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<LineMeta>('/api/line/send')
    if (ok && data) setMeta(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (initialUserId) {
      setUserId(initialUserId)
      setTargetMode('one')
    }
  }, [initialUserId])

  const copyWebhook = () => {
    if (!meta?.webhookUrl) return
    void navigator.clipboard.writeText(meta.webhookUrl)
    toast.success('คัดลอก Webhook URL แล้ว')
  }

  const send = async () => {
    const text = message.trim()
    if (!text) {
      toast.error('กรุณากรอกข้อความ')
      return
    }
    if (targetMode === 'one' && !userId) {
      toast.error('เลือกพนักงาน')
      return
    }

    setSending(true)
    try {
      const { ok, data, status } = await apiJson<{
        sent?: number
        failed?: number
        errors?: string[]
        message?: string
        error?: string
      }>('/api/line/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          userId: targetMode === 'one' ? userId : undefined,
          broadcastLinked: targetMode === 'all',
        }),
      })

      if (!ok) {
        const err =
          data?.error ??
          data?.errors?.[0] ??
          apiErrorMessage(data as Record<string, unknown>, 'ส่งไม่สำเร็จ', status)
        toast.error(err)
        return
      }

      if (data.failed && data.failed > 0) {
        toast.warning(
          `ส่งสำเร็จ ${data.sent ?? 0} คน, ไม่สำเร็จ ${data.failed} คน`,
        )
      } else {
        toast.success(data.message ?? `ส่งเข้า LINE แล้ว ${data.sent ?? 1} คน`)
      }
      setMessage('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs dark:text-slate-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        กำลังโหลด...
      </div>
    )
  }

  if (!meta?.configured) {
    return (
      <p className="text-xs dark:text-amber-400/90 light:text-amber-700 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
        ตั้งค่า LINE Channel Secret + Access Token ใน Vercel (โปรเจกต์ hrflow-app) แล้ว Redeploy
        ก่อนส่งข้อความ
      </p>
    )
  }

  const linkedEmployees = meta.employees.filter((e) => e.linked)

  return (
    <div className={`space-y-4 ${compact ? '' : 'pt-1'}`}>
      {!compact && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          เชื่อม LINE OA พร้อมส่ง — ผูกแล้ว {meta.linkedCount}/{meta.totalActive} คน
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] dark:text-slate-500">
        <span>Webhook:</span>
        <code className="font-mono break-all flex-1 dark:text-slate-400">{meta.webhookUrl}</code>
        <button
          type="button"
          onClick={copyWebhook}
          className="inline-flex items-center gap-1 text-blue-400 hover:underline"
        >
          <Copy className="w-3 h-3" />
          คัดลอก
        </button>
      </div>
      {meta.webhookUrl.includes('hrprogramkm') && (
        <p className="text-[11px] text-amber-400/90 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          Webhook ชี้ hrprogramkm — ให้ตั้งใน LINE Console เป็น{' '}
          <strong>https://hrflow-app-gamma.vercel.app/api/line/webhook</strong> แล้วกด Verify
        </p>
      )}

      <div className="flex rounded-xl border dark:border-white/10 light:border-slate-200 overflow-hidden">
        {(
          [
            { id: 'one' as const, label: 'พนักงานคนเดียว' },
            { id: 'all' as const, label: `ทุกคนที่ผูก LINE (${linkedEmployees.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTargetMode(t.id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition ${
              targetMode === t.id
                ? 'bg-[#06C755] text-white'
                : 'dark:text-slate-400 dark:hover:text-white light:text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {targetMode === 'one' && (
        <div>
          <label className="block text-xs dark:text-slate-400 mb-1.5">เลือกพนักงาน</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-xl dark:bg-white/5 light:bg-slate-50 border dark:border-white/10 light:border-slate-200 px-3 py-2.5 text-sm dark:text-white light:text-slate-900"
          >
            <option value="">— เลือก —</option>
            {meta.employees.map((e) => (
              <option key={e.id} value={e.id} className="bg-slate-900">
                {e.name}
                {e.employeeId ? ` (${e.employeeId})` : ''}
                {e.linked ? ' ✓ LINE' : ' — ยังไม่ผูก'}
              </option>
            ))}
          </select>
          {userId && !meta.employees.find((e) => e.id === userId)?.linked && (
            <p className="mt-1.5 text-[11px] text-amber-400">
              พนักงานยังไม่ผูก LINE — ให้ไปโปรไฟล์ → สร้างรหัส → ส่งในแชท OA
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs dark:text-slate-400 mb-1.5">ข้อความ</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={compact ? 3 : 4}
          maxLength={5000}
          placeholder="พิมพ์ข้อความที่ HR ต้องการส่งเข้า LINE..."
          className="w-full rounded-xl dark:bg-white/5 light:bg-slate-50 border dark:border-white/10 light:border-slate-200 px-3 py-2.5 text-sm dark:text-white light:text-slate-900 resize-none"
        />
        <p className="text-[10px] dark:text-slate-600 mt-1">{message.length}/5000</p>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={sending || (targetMode === 'all' && linkedEmployees.length === 0)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-sm font-semibold disabled:opacity-50 transition touch-manipulation"
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {sending ? 'กำลังส่ง...' : 'ส่งเข้า LINE'}
      </button>

      {targetMode === 'all' && linkedEmployees.length === 0 && (
        <p className="text-xs text-amber-400 text-center">ยังไม่มีพนักงานที่ผูก LINE OA</p>
      )}
    </div>
  )
}
