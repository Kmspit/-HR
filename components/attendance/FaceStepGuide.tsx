'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FaceGuideStep = {
  title: string
  body: string
  tip?: string
}

type Props = {
  steps: FaceGuideStep[]
  currentIndex: number
  className?: string
}

export default function FaceStepGuide({ steps, currentIndex, className }: Props) {
  const total = steps.length
  const pct = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 100

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide dark:text-slate-400 light:text-slate-500">
          ขั้นตอนที่ {currentIndex + 1} / {total}
        </p>
        <span className="text-[11px] tabular-nums dark:text-cyan-400 light:text-blue-600 font-medium">
          {pct}%
        </span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden dark:bg-white/10 light:bg-slate-200"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="space-y-2" aria-label="ขั้นตอนการสอน">
        {steps.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li
              key={s.title}
              className={cn(
                'flex gap-2.5 rounded-xl px-3 py-2.5 border transition-colors',
                active &&
                  'dark:bg-cyan-500/10 dark:border-cyan-500/30 light:bg-blue-50 light:border-blue-200',
                done &&
                  !active &&
                  'dark:bg-white/[0.02] dark:border-white/5 light:bg-slate-50/80 light:border-slate-100 opacity-80',
                !done &&
                  !active &&
                  'dark:border-transparent light:border-transparent opacity-45',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  done && 'bg-green-500/20 text-green-400',
                  active && !done && 'bg-cyan-500/25 text-cyan-300 light:text-blue-700',
                  !done && !active && 'dark:bg-white/5 light:bg-slate-200 dark:text-slate-500 light:text-slate-500',
                )}
                aria-hidden
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-xs font-semibold leading-snug',
                    active
                      ? 'dark:text-white light:text-slate-900'
                      : 'dark:text-slate-400 light:text-slate-600',
                  )}
                >
                  {s.title}
                </p>
                {active && (
                  <>
                    <p className="text-[11px] mt-1 dark:text-slate-300 light:text-slate-600 leading-relaxed">
                      {s.body}
                    </p>
                    {s.tip && (
                      <p className="text-[10px] mt-1.5 rounded-lg px-2 py-1 dark:bg-amber-500/10 dark:text-amber-200/90 light:bg-amber-50 light:text-amber-800">
                        💡 {s.tip}
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export const REGISTER_GUIDE_STEPS: FaceGuideStep[] = [
  {
    title: 'อ่านวิธีใช้งาน',
    body: 'ลงทะเบียนใบหน้าครั้งเดียว ระบบเก็บเฉพาะรหัสเข้ารหัส ไม่เก็บรูปถาวร',
    tip: 'ต้องใช้กล้องหน้าเท่านั้น ห้ามอัปโหลดรูปจากแกลเลอรี่',
  },
  {
    title: 'อนุญาตกล้อง',
    body: 'กดอนุญาตเมื่อเบราว์เซอร์ถาม และรอจนเห็นภาพตัวเองในกรอบ',
    tip: 'ถ้าไม่ขึ้น ให้ตรวจสอบการตั้งค่าความเป็นส่วนตัวของกล้อง',
  },
  {
    title: 'สแกนหน้าตรง (ครั้งที่ 1)',
    body: 'มองตรงกล้อง จัดใบหน้าให้อยู่กลางกรอบประ แล้วกดจับภาพตัวอย่าง',
    tip: 'ถอดแว่น/หมวกที่บังใบหน้า ถ้าแสงน้อยให้หันหน้าเข้าหาแสง',
  },
  {
    title: 'สแกนเอียงซ้ายเล็กน้อย (ครั้งที่ 2)',
    body: 'หันศีรษะช้า ๆ ไปทางซ้ายเล็กน้อย แล้วกดจับภาพตัวอย่างอีกครั้ง',
    tip: 'ไม่ต้องหันจนสุด — เอียงประมาณ 15–20 องศา',
  },
  {
    title: 'สแกนเอียงขวาเล็กน้อย (ครั้งที่ 3)',
    body: 'หันศีรษะช้า ๆ ไปทางขวาเล็กน้อย แล้วกดจับภาพตัวอย่างครั้งสุดท้าย',
    tip: 'ช่วยให้ระบบจดจำใบหน้าได้แม่นยำขึ้น',
  },
  {
    title: 'ยืนยันและบันทึก',
    body: 'ระบบตรวจความมีชีวิตอัตโนมัติ จากนั้นกดยืนยันเพื่อบันทึกลงระบบ',
    tip: 'ขยับศีรษะเบา ๆ ระหว่างรอสักครู่',
  },
]

export const VERIFY_GUIDE_STEPS: FaceGuideStep[] = [
  {
    title: 'เตรียมสแกน',
    body: 'อ่านขั้นตอนก่อน แล้วเปิดกล้องเมื่อพร้อม',
    tip: 'ใช้ Face Recognition เฉพาะคนที่ลงทะเบียนแล้ว',
  },
  {
    title: 'เปิดกล้องและโหลดระบบ',
    body: 'รอจนโมเดลโหลดเสร็จ และเห็นภาพตัวเองชัดในกรอบ',
  },
  {
    title: 'ตรวจความมีชีวิต',
    body: 'มองกล้องแล้วขยับศีรษะช้า ๆ ซ้าย–ขวาเล็กน้อย จากนั้นกดเริ่มตรวจ',
    tip: 'ห้ามใช้รูปถ่ายหรือภาพจากหน้าจอ',
  },
  {
    title: 'สแกนและยืนยันตัวตน',
    body: 'จัดใบหน้าให้อยู่กลางกรอบ แล้วกดสแกนเพื่อเทียบกับที่ลงทะเบียน',
    tip: 'ถ้าไม่ผ่าน ลองปรับแสงหรือถอดสิ่งบังใบหน้า',
  },
]
