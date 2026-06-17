'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, AlertCircle, CheckCircle, Clock, Activity, Shield, FileText } from 'lucide-react'

interface LogItem {
  id: string
  actorId: string
  actorName: string
  docType: string
  docId: string
  docRef: string | null
  action: string
  detail: string | null
  beforeValue: string | null
  afterValue: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  APPROVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  LOGIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  LOGOUT: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
}

const DOC_TYPE_ICONS: Record<string, React.ReactNode> = {
  payroll:    <FileText className="w-3.5 h-3.5" />,
  leave:      <Clock className="w-3.5 h-3.5" />,
  employee:   <Activity className="w-3.5 h-3.5" />,
  security:   <Shield className="w-3.5 h-3.5" />,
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SystemLogsClient() {
  const [logs, setLogs]       = useState<LogItem[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')
  const [docType, setDocType] = useState('')
  const [action, setAction]   = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (docType) params.set('docType', docType)
      if (action)  params.set('action', action)

      const r = await fetch(`/api/activity-log?${params}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setLogs(d.items)
      setTotal(d.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว')
    } finally {
      setLoading(false)
    }
  }, [page, docType, action])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? logs.filter(l =>
        l.actorName.toLowerCase().includes(search.toLowerCase()) ||
        l.docType.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.detail ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const pages = Math.ceil(total / 50)

  return (
    <div className="flex-1 px-4 md:px-6 py-4 pb-mobile-nav space-y-4">

      {/* Health status shortcut */}
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href="/api/system/health"
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors border border-green-200 dark:border-green-800"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          System Health
        </a>
        <span className="text-xs text-slate-400">{total.toLocaleString('th-TH')} รายการทั้งหมด</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา actor, docType, action..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
        <select
          value={docType}
          onChange={e => { setDocType(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        >
          <option value="">ทุก Module</option>
          <option value="payroll">Payroll</option>
          <option value="leave">Leave</option>
          <option value="employee">Employee</option>
          <option value="attendance">Attendance</option>
          <option value="approval">Approval</option>
          <option value="security">Security</option>
        </select>
        <select
          value={action}
          onChange={e => { setAction(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        >
          <option value="">ทุก Action</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="APPROVE">APPROVE</option>
          <option value="REJECT">REJECT</option>
          <option value="LOGIN">LOGIN</option>
        </select>
        <button
          onClick={load}
          className="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">โหลดข้อมูลล้มเหลว: {error}</p>
          </div>
          <button onClick={load} className="text-xs underline">ลองใหม่</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* Log list */}
      {!loading && !error && (
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">ไม่พบบันทึกกิจกรรม</p>
            </div>
          ) : (
            filtered.map(log => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/60 overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="mt-0.5 text-slate-400">
                    {DOC_TYPE_ICONS[log.docType.toLowerCase()] ?? <Activity className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                        {log.action}
                      </span>
                      <span className="text-[12px] font-medium text-slate-700 dark:text-white">
                        {log.actorName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {log.docType} #{log.docId.slice(0, 8)}
                      </span>
                    </div>
                    {log.detail && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{log.detail}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{fmtDate(log.createdAt)}</span>
                </button>

                {expanded === log.id && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-100 dark:border-white/[0.05] space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <p className="text-slate-400 mb-0.5">IP</p>
                        <p className="font-mono text-slate-600 dark:text-slate-300">{log.ip ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-0.5">Role</p>
                        <p className="text-slate-600 dark:text-slate-300">{log.actor?.role ?? '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-400 mb-0.5">User Agent</p>
                        <p className="text-slate-600 dark:text-slate-300 truncate">{log.userAgent ?? '—'}</p>
                      </div>
                    </div>
                    {(log.beforeValue || log.afterValue) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {log.beforeValue && (
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1">Before</p>
                            <pre className="text-[10px] font-mono bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-lg p-2 overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.beforeValue), null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.afterValue && (
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1">After</p>
                            <pre className="text-[10px] font-mono bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-lg p-2 overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.afterValue), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            ← ก่อนหน้า
          </button>
          <span className="text-sm text-slate-500">{page} / {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            ถัดไป →
          </button>
        </div>
      )}
    </div>
  )
}
