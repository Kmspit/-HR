'use client'

import { AlertCircle, User2, Calendar, Paperclip } from 'lucide-react'
import {
  type Task, type TabId,
  DEPT_COLOR, DEPT_LABEL, TYPE_LABEL,
  fmtDate, isOverdue, effectiveStatus,
  StatusBadge, DeptBadge, OverdueSeverityBadge, BlockedBadge,
} from './tasks-constants'

// ── Kanban ────────────────────────────────────────────────────────────────────

const KANBAN_COLS: { id: string; label: string; colorCls: string }[] = [
  { id: 'NEW',            label: 'ใหม่',      colorCls: 'border-slate-300 dark:border-slate-600' },
  { id: 'ASSIGNED',       label: 'มอบหมาย',   colorCls: 'border-blue-300 dark:border-blue-700' },
  { id: 'IN_PROGRESS',    label: 'กำลังทำ',   colorCls: 'border-amber-300 dark:border-amber-700' },
  { id: 'WAITING_REVIEW', label: 'รอตรวจ',    colorCls: 'border-purple-300 dark:border-purple-700' },
  { id: 'WAITING_DOC',    label: 'รอเอกสาร',  colorCls: 'border-yellow-300 dark:border-yellow-700' },
  { id: 'REVISION',       label: 'ขอแก้ไข',   colorCls: 'border-orange-300 dark:border-orange-700' },
  { id: 'COMPLETED',      label: 'เสร็จสิ้น', colorCls: 'border-green-300 dark:border-green-700' },
  { id: 'CANCELLED',      label: 'ยกเลิก',    colorCls: 'border-red-200 dark:border-red-900' },
  { id: 'REJECTED',       label: 'ปฏิเสธ',    colorCls: 'border-red-300 dark:border-red-800' },
]

type KanbanProps = { tasks: Task[]; onSelect: (t: Task) => void }

export function KanbanBoard({ tasks, onSelect }: KanbanProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ scrollSnapType: 'x mandatory' }}>
      {KANBAN_COLS.map((col) => {
        const colTasks = tasks.filter((t) => effectiveStatus(t) === col.id)
        return (
          <div key={col.id}
            className={`flex-shrink-0 w-64 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border-t-4 ${col.colorCls} border border-slate-100 dark:border-white/[0.04] flex flex-col gap-2 p-3`}
            style={{ scrollSnapAlign: 'start' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{col.label}</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.05] rounded-full w-5 h-5 flex items-center justify-center">
                {colTasks.length}
              </span>
            </div>
            {colTasks.length === 0 && (
              <p className="text-center text-[11px] text-slate-300 dark:text-slate-700 py-4">ไม่มีงาน</p>
            )}
            {colTasks.map((t) => (
              <button key={t.id} type="button" onClick={() => onSelect(t)}
                className="w-full text-left rounded-xl bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07] px-3 py-2.5 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-sm transition-all">
                {(t.taskDepartment || t.caseNumber) && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {t.taskDepartment && (
                      <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 border ${DEPT_COLOR[t.taskDepartment] ?? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600'}`}>
                        {DEPT_LABEL[t.taskDepartment] ?? t.taskDepartment}
                      </span>
                    )}
                    {t.caseNumber && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{t.caseNumber}</span>
                    )}
                  </div>
                )}
                <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200 leading-snug mb-1.5 line-clamp-2">{t.title}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isOverdue(t) && <OverdueSeverityBadge task={t} />}
                  {t.isBlocked && <BlockedBadge />}
                  {t.dueDate && (
                    <span className={`text-[10px] font-medium ${isOverdue(t) ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      {fmtDate(t.dueDate)}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 truncate">{t.assignee.name}</p>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Stat Strip ────────────────────────────────────────────────────────────────

type StatStripProps = { tasks: Task[] }

export function StatStrip({ tasks }: StatStripProps) {
  const overdue   = tasks.filter(isOverdue).length
  const urgent    = tasks.filter((t) => t.priority === 'URGENT').length
  const blocked   = tasks.filter((t) => t.isBlocked).length

  if (overdue === 0 && urgent === 0 && blocked === 0) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {overdue > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5" />เกินกำหนด {overdue} งาน
        </div>
      )}
      {urgent > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20">
          เร่งด่วน {urgent} งาน
        </div>
      )}
      {blocked > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
          ติดปัญหา {blocked} งาน
        </div>
      )}
    </div>
  )
}

// ── Task Row (desktop table <tr>) ─────────────────────────────────────────────

type TaskRowProps = { task: Task; showAssigner: boolean; onClick: () => void }

export function TaskRow({ task, showAssigner, onClick }: TaskRowProps) {
  const eff    = effectiveStatus(task)
  const overdue = isOverdue(task)

  return (
    <tr onClick={onClick}
      className={`border-b border-slate-100 dark:border-white/[0.04] hover:bg-blue-50/60 dark:hover:bg-white/[0.03] transition-colors cursor-pointer ${overdue ? 'bg-red-50/40 dark:bg-red-500/[0.03]' : ''}`}>

      <td className="px-4 py-3 max-w-[160px]">
        {task.caseNumber && (
          <p className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 mb-0.5">{task.caseNumber}</p>
        )}
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug truncate">{task.title}</p>
        {task.clientName && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-0.5 mt-0.5">
            <User2 className="w-2.5 h-2.5 flex-shrink-0" />{task.clientName}
          </p>
        )}
        {(task._count?.attachments ?? task.attachments?.length ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 mt-0.5">
            <Paperclip className="w-2.5 h-2.5" />{task._count?.attachments ?? task.attachments?.length}
          </span>
        )}
      </td>

      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
        {task.taskDepartment
          ? <DeptBadge dept={task.taskDepartment} />
          : <span className="text-[12px] text-slate-400 dark:text-slate-600">—</span>
        }
      </td>

      <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
        <span className="text-[12px] text-slate-500 dark:text-slate-400">{TYPE_LABEL[task.type] ?? task.type}</span>
      </td>

      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-[13px] text-slate-700 dark:text-slate-300">
          {showAssigner ? task.assignedBy.name : task.assignee.name}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{task.assignee.department ?? ''}</p>
      </td>

      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={eff} /></td>

      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-[12px] ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {fmtDate(task.dueDate)}
        </span>
        {overdue && <OverdueSeverityBadge task={task} />}
        {task.isBlocked && <BlockedBadge />}
        {(task.courtDate || task.appointmentDate) && (
          <p className="text-[10px] text-amber-500 dark:text-amber-400 flex items-center gap-0.5 mt-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {fmtDate(task.courtDate ?? task.appointmentDate)}
          </p>
        )}
      </td>

      <td className="px-3 py-3 text-slate-300 dark:text-slate-600 text-[10px]">›</td>
    </tr>
  )
}
