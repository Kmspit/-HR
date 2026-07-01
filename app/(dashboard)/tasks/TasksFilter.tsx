'use client'

import { Search, SlidersHorizontal, LayoutGrid, List, Plus, Sparkles } from 'lucide-react'
import { type TabId, type ViewMode, DEPT_OPTIONS, DEPT_LABEL, STATUS_TABS } from './tasks-constants'

type FiltersState = {
  priority: string
  status: string
  assigneeId: string
  type: string
  overdue: boolean
}

type TasksFilterProps = {
  tab: TabId
  setTab: (t: TabId) => void
  filter: FiltersState
  setFilter: (f: FiltersState) => void
  deptFilter: string
  setDeptFilter: (d: string) => void
  showDeptFilter: boolean
  setShowDeptFilter: (v: boolean) => void
  search: string
  setSearch: (s: string) => void
  smartFilter: string
  setSmartFilter: (s: string) => void
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
  tabs: { id: TabId; label: string; count: number }[]
  canAssign: boolean
  onCreateTask: () => void
  totalFiltered: number
}

export function TasksFilter({
  tab, setTab, filter, setFilter, deptFilter, setDeptFilter,
  showDeptFilter, setShowDeptFilter, search, setSearch,
  smartFilter, setSmartFilter, viewMode, setViewMode,
  tabs, canAssign, onCreateTask, totalFiltered,
}: TasksFilterProps) {
  const hasActiveFilter = filter.priority !== 'all' || filter.status !== 'all' ||
    filter.assigneeId !== 'all' || filter.type !== 'all' || filter.overdue || deptFilter !== 'all'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 relative min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหางาน..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400/60"
          />
        </div>

        <button type="button" onClick={() => setShowDeptFilter(!showDeptFilter)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium border transition-colors
            ${hasActiveFilter
              ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
              : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          ตัวกรอง
          {hasActiveFilter && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" aria-hidden />
          )}
        </button>

        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
          <button type="button" onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors
              ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.08]'}`}>
            <List className="w-3.5 h-3.5" />รายการ
          </button>
          <button type="button" onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-l border-slate-200 dark:border-white/10 transition-colors
              ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.08]'}`}>
            <LayoutGrid className="w-3.5 h-3.5" />Kanban
          </button>
        </div>

        {canAssign && (
          <button type="button" onClick={onCreateTask}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-white border border-transparent transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
            <Plus className="w-4 h-4" />สร้างงาน
          </button>
        )}
      </div>

      {showDeptFilter && (
        <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.06] px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">ฝ่าย</label>
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-[12px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 focus:outline-none">
                <option value="all">ทุกฝ่าย</option>
                {DEPT_OPTIONS.filter(o => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">ความสำคัญ</label>
              <select value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                className="w-full rounded-lg px-2 py-1.5 text-[12px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 focus:outline-none">
                <option value="all">ทั้งหมด</option>
                <option value="URGENT">เร่งด่วน</option>
                <option value="HIGH">สูง</option>
                <option value="MEDIUM">ปานกลาง</option>
                <option value="LOW">ต่ำ</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">สถานะ</label>
              <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                className="w-full rounded-lg px-2 py-1.5 text-[12px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 focus:outline-none">
                <option value="all">ทั้งหมด</option>
                {STATUS_TABS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">กรอง</label>
              <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                <input type="checkbox" checked={filter.overdue}
                  onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })}
                  className="w-4 h-4 rounded accent-red-500" />
                <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium">เฉพาะเกินกำหนด</span>
              </label>
            </div>
          </div>

          <div className="relative">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" aria-hidden />
            <input type="text" value={smartFilter} onChange={(e) => setSmartFilter(e.target.value)}
              placeholder='Smart filter เช่น "เร่งด่วนกฎหมาย" หรือ "สมชายรอตรวจ"'
              className="w-full pl-9 pr-3 py-2 rounded-xl text-[12px] bg-white dark:bg-white/5 border border-purple-200 dark:border-purple-500/30 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-400/60" />
          </div>

          {hasActiveFilter && (
            <button type="button"
              onClick={() => {
                setFilter({ priority: 'all', status: 'all', assigneeId: 'all', type: 'all', overdue: false })
                setDeptFilter('all')
                setSmartFilter('')
              }}
              className="text-[12px] font-medium text-red-500 dark:text-red-400 hover:text-red-600 transition-colors">
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all
              ${tab === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.06]'
              }`}>
            {t.label}
            <span className={`rounded-full text-[10px] font-bold px-1.5 min-w-[18px] text-center
              ${tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {totalFiltered > 0 && (search || hasActiveFilter) && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          แสดง {totalFiltered} งาน
          {search && <> ที่ตรงกับ &quot;<span className="font-medium text-slate-700 dark:text-slate-300">{search}</span>&quot;</>}
        </p>
      )}
    </div>
  )
}
