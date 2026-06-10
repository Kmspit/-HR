'use client'

import { useState } from 'react'
import { Plus, X, ClipboardList, Loader, Eye, CheckCircle } from 'lucide-react'

// ── Dummy stat cards ─────────────────────────────────────────────────────────

const STATS = [
  { label: 'งานทั้งหมด', value: 0, color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-white/[0.06]', icon: <ClipboardList className="w-5 h-5 text-slate-400 dark:text-slate-500" /> },
  { label: 'กำลังทำ',    value: 0, color: 'text-blue-700  dark:text-blue-400',  bg: 'bg-blue-50  dark:bg-blue-500/10',  border: 'border-blue-200  dark:border-blue-500/20',  icon: <Loader        className="w-5 h-5 text-blue-400  dark:text-blue-500"  /> },
  { label: 'รอตรวจ',     value: 0, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20', icon: <Eye           className="w-5 h-5 text-amber-400 dark:text-amber-500" /> },
  { label: 'เสร็จสิ้น',  value: 0, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10', border: 'border-green-200 dark:border-green-500/20', icon: <CheckCircle   className="w-5 h-5 text-green-400 dark:text-green-500" /> },
]

// ── Empty modal ───────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4"
      >
        <div
          className="relative w-full md:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[60dvh] md:max-h-[70vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">สร้างงานใหม่</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 flex items-center justify-center px-5 py-8">
            <div className="text-center space-y-2">
              <p className="text-3xl">🚧</p>
              <p className="text-[14px] font-medium text-slate-600 dark:text-slate-300">ฟีเจอร์กำลังพัฒนา</p>
              <p className="text-[12px] text-slate-400 dark:text-slate-500">ระบบสร้างงานจะพร้อมใช้งานเร็วๆ นี้</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl py-3 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TasksClient() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">มอบหมายงาน</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">จัดการและติดตามงานพนักงาน</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 shadow-sm"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">สร้างงาน</span>
          <span className="sm:hidden">สร้าง</span>
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map(({ label, value, color, bg, border, icon }) => (
          <div
            key={label}
            className={`rounded-2xl p-4 border shadow-sm ${bg} ${border}`}
          >
            <div className="flex items-center justify-between mb-2">
              {icon}
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/[0.05]">
          <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">รายการงาน</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                {['ชื่องาน', 'ผู้รับผิดชอบ', 'สถานะ', 'กำหนดส่ง', 'ความสำคัญ'].map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-3xl">📋</p>
                    <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">ยังไม่มีงาน</p>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500">
                      กดปุ่ม &quot;สร้างงาน&quot; เพื่อมอบหมายงานใหม่
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
