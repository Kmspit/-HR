'use client'

import { useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

type Props = {
  open: boolean
  consentText: string
  submitting: boolean
  onAccept: () => void
  onDecline: () => void
}

const SCROLL_END_THRESHOLD_PX = 24

export default function BiometricConsentModal({ open, consentText, submitting, onAccept, onDecline }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_END_THRESHOLD_PX) {
      setScrolledToEnd(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="glass-card w-full max-w-lg rounded-2xl p-5 space-y-4 border dark:border-green-500/25 light:border-green-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/15 flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold dark:text-white light:text-slate-900">
              ความยินยอมเก็บข้อมูลชีวมิติ (ใบหน้า)
            </h3>
            <p className="text-xs mt-1 dark:text-slate-400 light:text-slate-600">
              กรุณาอ่านข้อความให้จบก่อนกดยอมรับ
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto rounded-xl border dark:border-white/10 light:border-slate-200 p-3 text-xs leading-relaxed whitespace-pre-wrap dark:text-slate-300 light:text-slate-700"
        >
          {consentText}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            ไม่ยอมรับ
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!scrolledToEnd || submitting}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
            title={!scrolledToEnd ? 'เลื่อนอ่านข้อความให้จบก่อน' : undefined}
          >
            ยอมรับ
          </button>
        </div>
      </div>
    </div>
  )
}
