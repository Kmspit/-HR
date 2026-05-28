'use client'

import {
  PAYROLL_LATE_GRACE_MINUTES,
  SALARY_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
  WORK_MINUTES_PER_HOUR,
  type LateDeductionLine,
  parseLateDeductionDetail,
} from '@/lib/payroll-late-deduction'

type Props = {
  baseSalary: number
  lateDeduction: number
  lateBillableMinutes: number
  lateDays: number
  lateDeductionDetail?: string | null
}

const EXCLUDE_LABELS: Record<string, string> = {
  leave: 'ลาอนุมัติ — ไม่หัก',
  holiday: 'วันหยุด — ไม่หัก',
  grace_only: `สายไม่เกิน ${PAYROLL_LATE_GRACE_MINUTES} นาที — ไม่หัก`,
}

export default function LateDeductionDetail({
  baseSalary,
  lateDeduction,
  lateBillableMinutes,
  lateDays,
  lateDeductionDetail,
}: Props) {
  const lines = parseLateDeductionDetail(lateDeductionDetail)
  const rate =
    baseSalary > 0
      ? baseSalary / SALARY_DAYS_PER_MONTH / WORK_HOURS_PER_DAY / WORK_MINUTES_PER_HOUR
      : 0

  if (lateDeduction <= 0 && lines.length === 0) {
    return <p className="text-xs text-white/40">ไม่มีการหักมาสายในเดือนนี้</p>
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 space-y-1">
        <p className="text-yellow-200/90 font-semibold">สูตรหักมาสาย</p>
        <p className="text-white/60 font-mono text-[11px]">
          เงินเดือน ÷ {SALARY_DAYS_PER_MONTH} ÷ {WORK_HOURS_PER_DAY} ÷ {WORK_MINUTES_PER_HOUR} ×
          นาทีหักได้
        </p>
        <p className="text-white/50">
          ฿{baseSalary.toLocaleString()} ÷ {SALARY_DAYS_PER_MONTH} ÷ {WORK_HOURS_PER_DAY} ÷{' '}
          {WORK_MINUTES_PER_HOUR} = ฿{rate.toFixed(4)}/นาที
        </p>
        <p className="text-white/50">
          ยกเว้น {PAYROLL_LATE_GRACE_MINUTES} นาที/วัน · ไม่หักวันลาอนุมัติ · ไม่หักวันหยุด
        </p>
        <p className="text-yellow-300 font-semibold pt-1">
          รวมหัก ฿{lateDeduction.toFixed(2)} ({lateBillableMinutes} นาที · {lateDays} วัน)
        </p>
      </div>

      {lines.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-900/95">
              <tr className="border-b border-white/10 text-white/40">
                <th className="text-left p-2">วันที่</th>
                <th className="text-right p-2">สาย(น.)</th>
                <th className="text-right p-2">หัก(น.)</th>
                <th className="text-right p-2">บาท</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <LateRow key={line.date + (line.excludedReason ?? 'bill')} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LateRow({ line }: { line: LateDeductionLine }) {
  const excluded = line.excludedReason
  return (
    <tr className="border-b border-white/5">
      <td className="p-2 text-white/70 whitespace-nowrap">{line.date}</td>
      <td className="p-2 text-right text-white/50">{line.recordedLateMinutes}</td>
      <td className="p-2 text-right">
        {excluded ? (
          <span className="text-slate-500">{EXCLUDE_LABELS[excluded] ?? excluded}</span>
        ) : (
          <span className="text-yellow-300">{line.billableMinutes}</span>
        )}
      </td>
      <td className="p-2 text-right text-red-400">
        {line.amount > 0 ? `-฿${line.amount.toFixed(2)}` : '—'}
      </td>
    </tr>
  )
}
