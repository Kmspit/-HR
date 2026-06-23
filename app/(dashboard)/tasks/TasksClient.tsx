'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Building2, Search, X, SlidersHorizontal,
  LayoutGrid, List, ChevronDown, User2,
} from 'lucide-react'
import {
  type Task, type TaskTemplate, type WorkloadInfo, type TabId, type UserSnip,
  ACTIVE_STATUSES, DEPT_LABEL, DEPT_OPTIONS,
  isOverdue, effectiveStatus,
  StatusBadge, DeptBadge, OverdueSeverityBadge,
  fmtDate,
} from './tasks-constants'
import { KanbanBoard, StatStrip, TaskRow } from './TasksTable'
import { TaskDetailModal, CreateTaskModal } from './TasksModal'

type ViewMode = 'list' | 'kanban'

type Props = {
  role: string
  userId: string
  userName: string
  myTasks: Task[]
  assignedByMeTasks: Task[]
  allTasks: Task[]
  employees: UserSnip[]
  canAssign: boolean
  canSeeAll: boolean
}

const STATUS_TABS = [
  { id: 'all',       label: 'ทั้งหมด' },
  { id: 'active',    label: 'กำลังดำเนิน' },
  { id: 'review',    label: 'รอตรวจ' },
  { id: 'overdue',   label: 'เกินกำหนด' },
  { id: 'completed', label: 'เสร็จสิ้น' },
]

export default function TasksClient({
  role, userId, userName,
  myTasks: initMy, assignedByMeTasks: initByMe, allTasks: initAll,
  employees, canAssign, canSeeAll,
}: Props) {
  const router = useRouter()

  const [tab,            setTab]          = useState<TabId>('my')
  const [filter,         setFilter]       = useState('all')
  const [deptFilter,     setDeptFilter]   = useState('all')
  const [viewMode,       setViewMode]     = useState<ViewMode>('list')
  const [showDeptFilter, setShowDeptFilter] = useState(false)
  const [search,         setSearch]       = useState('')
  const [smartFilter,    setSmartFilter]  = useState('all')
  const [myTasks,        setMyTasks]      = useState<Task[]>(initMy)
  const [byMeTasks,      setByMe]         = useState<Task[]>(initByMe)
  const [allList,        setAll]          = useState<Task[]>(initAll)
  const [showCreate,     setCreate]       = useState(false)
  const [selected,       setSelected]     = useState<Task | null>(null)
  const [templates,      setTemplates]    = useState<TaskTemplate[]>([])
  const [workloadMap,    setWorkloadMap]  = useState<Record<string, WorkloadInfo>>({})

  useEffect(() => {
    if (!canAssign) return
    fetch('/api/tasks/templates').then(r => r.json()).then((d: { templates?: TaskTemplate[] }) => {
      if (d.templates) setTemplates(d.templates)
    }).catch(() => {})
    fetch('/api/tasks/workload').then(r => r.json()).then((d: { workload?: WorkloadInfo[] }) => {
      if (d.workload) {
        const map: Record<string, WorkloadInfo> = {}
        d.workload.forEach((w) => { map[w.userId] = w })
        setWorkloadMap(map)
      }
    }).catch(() => {})
  }, [canAssign])

  const currentList = tab === 'my' ? myTasks : tab === 'by_me' ? byMeTasks : allList

  const filtered = useMemo(() => {
    let list = currentList
    if (deptFilter !== 'all') list = list.filter((t) => t.taskDepartment === deptFilter)
    if (filter === 'overdue')        list = list.filter(isOverdue)
    else if (filter === 'active')    list = list.filter((t) => ACTIVE_STATUSES.includes(t.status) && !isOverdue(t))
    else if (filter === 'review')    list = list.filter((t) => t.status === 'WAITING_REVIEW')
    else if (filter === 'completed') list = list.filter((t) => t.status === 'COMPLETED')

    const nowTs = Date.now()
    if (smartFilter === 'overdue') list = list.filter(isOverdue)
    else if (smartFilter === 'high') list = list.filter((t) => ['HIGH', 'URGENT'].includes(t.priority) && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(t.status))
    else if (smartFilter === 'today') {
      list = list.filter((t) => {
        if (!t.dueDate) return false
        const d = new Date(t.dueDate), nd = new Date()
        return d.getFullYear() === nd.getFullYear() && d.getMonth() === nd.getMonth() && d.getDate() === nd.getDate()
      })
    } else if (smartFilter === 'week') {
      list = list.filter((t) => {
        if (!t.dueDate) return false
        const ms = new Date(t.dueDate).getTime() - nowTs
        return ms >= 0 && ms <= 7 * 24 * 60 * 60 * 1000
      })
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.caseNumber?.toLowerCase() ?? '').includes(q) ||
        (t.clientName?.toLowerCase() ?? '').includes(q) ||
        t.assignee.name.toLowerCase().includes(q)
      )
    }

    return list
  }, [currentList, filter, deptFilter, smartFilter, search])

  function applyUpdate(updated: Task) {
    const apply = (list: Task[]) => list.map((t) => (t.id === updated.id ? updated : t))
    setMyTasks(apply); setByMe(apply); setAll(apply)
    setSelected(updated)
    router.refresh()
  }

  function handleCreated(task: Task) {
    setByMe((p) => [task, ...p]); setAll((p) => [task, ...p])
    if (task.assigneeId === userId) setMyTasks((p) => [task, ...p])
    setCreate(false); router.refresh()
  }

  const tabs = [
    { id: 'my'    as TabId, label: 'งานของฉัน',     count: myTasks.length,   show: true },
    { id: 'by_me' as TabId, label: 'มอบหมายโดยฉัน', count: byMeTasks.length, show: canAssign },
    { id: 'all'   as TabId, label: 'ทุกงาน',        count: allList.length,   show: canSeeAll },
  ].filter((t) => t.show)

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">มอบหมายงาน</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">จัดการ ติดตาม และมอบหมายงานแต่ละฝ่าย</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-slate-900">
            <button type="button" onClick={() => setViewMode('list')} title="มุมมองรายการ"
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
              <List className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setViewMode('kanban')} title="มุมมองกระดาน"
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {canAssign && (
            <button type="button" onClick={() => setCreate(true)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">สร้างงาน</span>
              <span className="sm:hidden">สร้าง</span>
            </button>
          )}
        </div>
      </div>

      <StatStrip tasks={currentList} />

      {/* Tab switcher */}
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/[0.05]">
          {tabs.map((t) => (
            <button key={t.id} type="button"
              onClick={() => { setTab(t.id); setFilter('all'); setDeptFilter('all') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Department filter — collapsible */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <button type="button" onClick={() => setShowDeptFilter(v => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={14} />
            ตัวกรองฝ่าย
            {deptFilter !== 'all' && (
              <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5">{DEPT_LABEL[deptFilter] ?? deptFilter}</span>
            )}
          </span>
          <ChevronDown size={14} className={`transition-transform ${showDeptFilter ? 'rotate-180' : ''}`} />
        </button>
        {showDeptFilter && (
          <div className="flex flex-wrap gap-2 px-4 pb-3 border-t border-slate-100 dark:border-white/[0.05] pt-2.5">
            {[{ value: 'all', label: 'ทุกฝ่าย' }, ...DEPT_OPTIONS.filter((d) => d.value)].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setDeptFilter(value)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors border ${
                  deptFilter === value
                    ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}>
                {value !== 'all' && <Building2 className="w-2.5 h-2.5 inline mr-1 -mt-0.5" />}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหางาน, เลขคดี, ลูกค้า, พนักงาน..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400/60" />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Smart filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'all',    label: 'ทั้งหมด' },
          { id: 'overdue', label: '🔴 เกินกำหนด' },
          { id: 'high',   label: '🟠 เร่งด่วน/สูง' },
          { id: 'today',  label: '📅 ครบวันนี้' },
          { id: 'week',   label: '📆 ครบสัปดาห์นี้' },
        ] as const).map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setSmartFilter(id)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors border ${
              smartFilter === id
                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04]'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/[0.05]">
        {STATUS_TABS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={`flex-1 px-2 py-2 rounded-lg text-[12px] font-medium transition-all truncate ${
              filter === id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }${id === 'overdue' ? ' text-red-600 dark:text-red-400' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <KanbanBoard tasks={filtered} onSelect={setSelected} />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">รายการงาน</h2>
            <span className="text-[12px] text-slate-400">{filtered.length} รายการ</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">ยังไม่มีงาน</p>
              {canAssign && filter === 'all' && (
                <button type="button" onClick={() => setCreate(true)}
                  className="mt-2 text-[13px] text-blue-600 dark:text-blue-400 hover:underline">
                  + สร้างงานใหม่
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filtered.map((task) => {
                  const eff    = effectiveStatus(task)
                  const overdue = eff === 'OVERDUE'
                  const person  = tab === 'my' ? task.assignedBy : task.assignee
                  return (
                    <button key={task.id} type="button" onClick={() => setSelected(task)}
                      className="w-full text-left px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 flex-1">
                          {task.caseNumber && <span className="text-blue-600 dark:text-blue-400 mr-1">{task.caseNumber}</span>}
                          {task.title}
                        </p>
                        <StatusBadge status={eff} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.taskDepartment && <DeptBadge dept={task.taskDepartment} />}
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <User2 className="w-3 h-3 opacity-60" />{person.name}
                        </span>
                        {task.dueDate && (
                          <span className={`text-[11px] ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                            ครบ {fmtDate(task.dueDate)}
                          </span>
                        )}
                        {overdue && <OverdueSeverityBadge task={task} />}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                      {[
                        { label: 'เลขคดี / ชื่องาน', cls: '' },
                        { label: 'ฝ่าย',              cls: 'hidden sm:table-cell' },
                        { label: 'ประเภทงาน',         cls: 'hidden md:table-cell' },
                        { label: tab === 'my' ? 'มอบหมายโดย' : 'ผู้รับผิดชอบ', cls: '' },
                        { label: 'สถานะ',             cls: '' },
                        { label: 'กำหนดเสร็จ',        cls: '' },
                        { label: '',                   cls: '' },
                      ].map(({ label, cls }) => (
                        <th key={label} className={`text-left px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${cls}`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((task) => (
                      <TaskRow key={task.id} task={task} showAssigner={tab === 'my'} onClick={() => setSelected(task)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {selected && (
        <TaskDetailModal task={selected} role={role} userId={userId}
          onClose={() => setSelected(null)} onUpdated={applyUpdate} />
      )}
      {showCreate && (
        <CreateTaskModal employees={employees} assignerName={userName}
          onClose={() => setCreate(false)} onCreated={handleCreated}
          templates={templates} workloadMap={workloadMap} />
      )}

      {/* Mobile FAB */}
      {canAssign && (
        <button type="button" onClick={() => setCreate(true)}
          className="md:hidden fixed z-30 right-4 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-blue-600/30 active:scale-95 transition-transform"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 16px)' }}>
          <Plus className="w-4 h-4" />
          สร้างงาน
        </button>
      )}
    </div>
  )
}
