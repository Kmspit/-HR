'use client'

import { CheckCircle } from 'lucide-react'

type Props = {
  allowUpdate?: boolean
  onUpdateAgain: () => void
  onDone?: () => void
}

/**
 * Extracted from FaceRegistrationCard's phase==='done' branch specifically so
 * this can be unit-tested directly (as a small, fully prop-controlled
 * component) instead of needing to drive FaceRegistrationCard through its
 * whole camera/scan/API flow just to reach the 'done' phase.
 */
export default function FaceRegistrationDoneCard({ allowUpdate, onUpdateAgain, onDone }: Props) {
  return (
    <div className="glass-card rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">
      <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold dark:text-white light:text-slate-900">
          {allowUpdate ? 'อัปเดตใบหน้าเรียบร้อย' : 'ลงทะเบียนใบหน้าแล้ว'}
        </p>
        <p className="text-xs dark:text-slate-400 light:text-slate-600">
          ลงเวลาทุกครั้งต้องสแกนใบหน้าให้ตรงกับที่ลงทะเบียน
        </p>
      </div>
      {allowUpdate && (
        <div className="flex gap-2 flex-shrink-0 ml-auto">
          <button
            type="button"
            onClick={onUpdateAgain}
            className="btn-secondary py-2 px-3 text-xs whitespace-nowrap"
          >
            อัปเดตอีกครั้ง
          </button>
          <button
            type="button"
            onClick={onDone}
            className="btn-primary py-2 px-3 text-xs whitespace-nowrap"
          >
            เสร็จสิ้น
          </button>
        </div>
      )}
    </div>
  )
}
