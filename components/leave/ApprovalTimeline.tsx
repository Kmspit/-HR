'use client'

import { CheckCircle2, XCircle, Clock, SkipForward, User } from 'lucide-react'
import type { ApprovalStepRow } from '@/lib/approval-chain'
import { ROLE_LABELS } from '@/lib/permissions'
import type { Role } from '@prisma/client'

type Props = {
  steps: ApprovalStepRow[]
  currentStepOrder: number
  /** @deprecated use requestStatus */
  leaveStatus?: string
  requestStatus?: string
  className?: string
}

function StepIcon({ status }: { status: ApprovalStepRow['status'] }) {
  switch (status) {
    case 'APPROVED': return <CheckCircle2 className="h-5 w-5 text-green-400" />
    case 'REJECTED': return <XCircle       className="h-5 w-5 text-red-400" />
    case 'SKIPPED':  return <SkipForward   className="h-5 w-5 text-slate-500" />
    default:         return <Clock         className="h-5 w-5 text-amber-400" />
  }
}

function stepLabel(status: ApprovalStepRow['status'], isCurrent: boolean) {
  if (status === 'APPROVED') return 'อนุมัติแล้ว'
  if (status === 'REJECTED') return 'ปฏิเสธแล้ว'
  if (status === 'SKIPPED')  return 'ข้ามขั้นตอน'
  if (isCurrent)             return 'รออนุมัติ'
  return 'รอขั้นก่อนหน้า'
}

function stepBorderColor(status: ApprovalStepRow['status'], isCurrent: boolean) {
  if (status === 'APPROVED') return 'border-green-500/40 bg-green-500/5'
  if (status === 'REJECTED') return 'border-red-500/40 bg-red-500/5'
  if (status === 'SKIPPED')  return 'border-slate-600/40 bg-slate-800/30'
  if (isCurrent)             return 'border-amber-500/40 bg-amber-500/5'
  return 'border-white/10 bg-slate-800/20'
}

export default function ApprovalTimeline({ steps, currentStepOrder, leaveStatus, requestStatus, className }: Props) {
  if (!steps.length) return null

  const status = requestStatus ?? leaveStatus ?? 'PENDING'
  const isFinalized = status === 'APPROVED' || status === 'REJECTED'

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
        ขั้นตอนการอนุมัติ
      </p>

      <div className="relative">
        {/* Connector line */}
        <div className="absolute left-[18px] top-6 bottom-6 w-px bg-white/10" />

        <div className="space-y-2">
          {steps.map((step, idx) => {
            const isCurrent = !isFinalized && step.stepOrder === currentStepOrder && step.status === 'PENDING'
            return (
              <div key={step.id} className={`relative flex items-start gap-3 rounded-xl border p-3 transition-all ${stepBorderColor(step.status, isCurrent)}`}>
                {/* Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  <StepIcon status={step.status} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white leading-tight">
                      {idx + 1}. {step.stepName}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      step.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
                      step.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' :
                      step.status === 'SKIPPED'  ? 'bg-slate-500/20 text-slate-400' :
                      isCurrent                  ? 'bg-amber-500/20 text-amber-400' :
                                                   'bg-slate-700/40 text-slate-500'
                    }`}>
                      {stepLabel(step.status, isCurrent)}
                    </span>
                  </div>

                  {/* Approver role / specific user */}
                  {(step.approverRole || step.approverId) && (
                    <p className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {step.approverRole
                        ? (ROLE_LABELS[step.approverRole as Role] ?? step.approverRole)
                        : 'ผู้อนุมัติที่กำหนด'}
                    </p>
                  )}

                  {/* Actor info */}
                  {step.actor && step.actedAt && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      โดย <span className="text-white font-medium">{step.actor.name}</span>
                      {' · '}
                      {new Date(step.actedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}

                  {/* Comment */}
                  {step.comment && (
                    <p className="mt-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 border border-white/5">
                      "{step.comment}"
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Final status badge */}
      {isFinalized && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-center text-sm font-semibold ${
          status === 'APPROVED'
            ? 'border-green-500/40 bg-green-500/10 text-green-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}>
          {status === 'APPROVED' ? '✅ อนุมัติครบทุกขั้นตอน' : '❌ คำขอถูกปฏิเสธ'}
        </div>
      )}
    </div>
  )
}
