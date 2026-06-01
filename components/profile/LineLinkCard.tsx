'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, ExternalLink, Link2, Loader2, MessageCircle, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type LinkStatus = {
  configured: boolean
  linked: boolean
  lineUserId?: string | null
  lineDisplayName?: string | null
  lineOaBasicId?: string
  lineOaUrl?: string
  webhookUrl?: string
}

type Props = {
  onLinked?: () => void
}

function isMobileUa() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function openLineOa(url: string) {
  if (!url) return
  if (isMobileUa()) {
    window.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function LineLinkCard({ onLinked }: Props) {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState<string | null>(null)
  const [command, setCommand] = useState<string | null>(null)
  const [lineOaUrl, setLineOaUrl] = useState<string | null>(null)
  const [lineOaUrlWithMessage, setLineOaUrlWithMessage] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<LinkStatus>('/api/profile/line-link')
    if (ok && data) {
      setStatus(data)
      if (data.linked) {
        setCode(null)
        setCommand(null)
        setLineOaUrl(null)
        setLineOaUrlWithMessage(null)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyCommand = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('คัดลอกข้อความแล้ว')
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กดค้างที่ข้อความแล้ว Copy')
    }
  }

  const openOaChat = (preferPrefill = false) => {
    const url =
      (preferPrefill && lineOaUrlWithMessage) ||
      lineOaUrlWithMessage ||
      lineOaUrl ||
      status?.lineOaUrl
    if (!url) {
      toast.error('ไม่พบลิงก์ LINE OA')
      return
    }
    openLineOa(url)
  }

  const createCode = async () => {
    setBusy(true)
    const { ok, data, status: httpStatus } = await apiJson<{
      code: string
      command: string
      expiresAt: string
      lineOaUrl?: string
      lineOaUrlWithMessage?: string
      lineOaBasicId?: string
    }>('/api/profile/line-link', { method: 'POST' })
    setBusy(false)
    if (!ok) {
      toast.error(apiErrorMessage(data, 'สร้างรหัสไม่สำเร็จ', httpStatus))
      return
    }
    setCode(data.code)
    setCommand(data.command)
    setExpiresAt(data.expiresAt)
    setLineOaUrl(data.lineOaUrl ?? null)
    setLineOaUrlWithMessage(data.lineOaUrlWithMessage ?? null)

    await copyCommand(data.command)

    toast.success('สร้างรหัสแล้ว — กำลังเปิด LINE OA…', { duration: 3500 })
    setTimeout(() => openOaChat(true), 400)
  }

  const unlink = async () => {
    if (!confirm('ยกเลิกการเชื่อม LINE OA?')) return
    setBusy(true)
    const { ok, data, status: httpStatus } = await apiJson('/api/profile/line-link', { method: 'DELETE' })
    setBusy(false)
    if (!ok) {
      toast.error(apiErrorMessage(data, 'ยกเลิกไม่สำเร็จ', httpStatus))
      return
    }
    setCode(null)
    setCommand(null)
    setLineOaUrl(null)
    setLineOaUrlWithMessage(null)
    toast.success('ยกเลิกการเชื่อมแล้ว')
    await load()
    onLinked?.()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs dark:text-slate-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        กำลังโหลดสถานะ LINE...
      </div>
    )
  }

  if (!status?.configured) {
    return (
      <p className="text-xs dark:text-amber-400/90 light:text-amber-700 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
        ระบบยังไม่ได้ตั้งค่า LINE OA บนเซิร์ฟเวอร์ — ติดต่อผู้ดูแล (Channel Secret + Access Token)
      </p>
    )
  }

  if (status.linked) {
    return (
      <div className="space-y-3 rounded-xl dark:bg-green-500/10 light:bg-green-50 border border-green-500/25 px-4 py-3">
        <p className="text-sm font-medium text-green-400 flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          เชื่อม LINE OA แล้ว
        </p>
        {status.lineDisplayName && (
          <p className="text-xs dark:text-slate-300">ชื่อใน LINE: {status.lineDisplayName}</p>
        )}
        <p className="text-[10px] dark:text-slate-500 font-mono break-all">{status.lineUserId}</p>
        <p className="text-[11px] dark:text-slate-400">
          จะได้รับใบเตือนและแจ้งเตือนผ่าน LINE เมื่อ HR ส่งจากระบบ
        </p>
        <button
          type="button"
          onClick={unlink}
          disabled={busy}
          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50"
        >
          <Unlink className="w-3.5 h-3.5" />
          ยกเลิกการเชื่อม
        </button>
      </div>
    )
  }

  const oaLabel = status.lineOaBasicId ?? '@593qdkpk'

  return (
    <div className="space-y-3">
      <p className="text-xs dark:text-slate-400 light:text-slate-600 leading-relaxed">
        เพิ่มเพื่อน LINE OA ({oaLabel}) แล้วส่งรหัสในแชท — หลังผูกแล้วจะรับใบเตือนและแจ้งเตือนลงเวลาได้
      </p>
      <ol className="text-[11px] dark:text-slate-500 space-y-1 list-decimal list-inside">
        <li>กด &quot;สร้างรหัสและเปิด LINE&quot;</li>
        <li>ส่งข้อความที่คัดลอก (เช่น ลิงก์ ABC123) ในแชท OA</li>
        <li>กลับมากด &quot;ตรวจสอบสถานะ&quot;</li>
      </ol>

      {status.lineOaUrl && !code && (
        <button
          type="button"
          onClick={() => openLineOa(status.lineOaUrl!)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#06C755]/40 text-[#06C755] text-sm font-semibold hover:bg-[#06C755]/10"
        >
          <ExternalLink className="w-4 h-4" />
          เปิด LINE OA ({oaLabel})
        </button>
      )}

      {code && command ? (
        <div className="rounded-xl dark:bg-white/5 light:bg-slate-100 border dark:border-white/10 px-4 py-3 space-y-2">
          <p className="text-lg font-mono font-bold tracking-widest text-center text-green-400">{code}</p>
          <p className="text-sm text-center dark:text-white">{command}</p>
          {expiresAt && (
            <p className="text-[10px] text-center dark:text-slate-500">
              หมดอายุ {new Date(expiresAt).toLocaleTimeString('th-TH')}
            </p>
          )}
          <button
            type="button"
            onClick={() => void copyCommand(command)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border dark:border-white/10 text-xs dark:text-slate-300 hover:bg-white/5"
          >
            <Copy className="w-3.5 h-3.5" />
            คัดลอกข้อความ
          </button>
          <button
            type="button"
            onClick={() => openOaChat(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-sm font-semibold"
          >
            <ExternalLink className="w-4 h-4" />
            เปิด LINE OA แล้วส่งรหัส
          </button>
          <button
            type="button"
            onClick={load}
            className="w-full text-xs text-blue-400 hover:underline"
          >
            ผูกแล้ว? กดตรวจสอบสถานะ
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={createCode}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          สร้างรหัสและเปิด LINE
        </button>
      )}
    </div>
  )
}
