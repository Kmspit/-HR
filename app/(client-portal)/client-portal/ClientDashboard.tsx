'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusHistory {
  id: string
  status: string
  note: string | null
  changedByName: string
  createdAt: string
}

interface Task {
  id: string
  title: string
  caseNumber: string | null
  clientName: string | null
  taskDepartment: string | null
  status: string
  priority: string
  dueDate: string | null
  courtDate: string | null
  appointmentDate: string | null
  appointmentPlace: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; name: string; position: string | null }
  statusHistories: StatusHistory[]
}

interface Summary {
  total: number
  active: number
  completed: number
  upcoming: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  NEW:            'รับเรื่องแล้ว',
  ASSIGNED:       'มอบหมายแล้ว',
  IN_PROGRESS:    'กำลังดำเนินการ',
  WAITING_DOC:    'รอเอกสาร',
  WAITING_REVIEW: 'รอตรวจสอบ',
  REVISION:       'ส่งกลับแก้ไข',
  COMPLETED:      'เสร็จสิ้น',
  OVERDUE:        'เกินกำหนด',
  PENDING:        'รอดำเนินการ',
}

const STATUS_COLORS: Record<string, string> = {
  NEW:            'bg-green-100 text-green-700',
  ASSIGNED:       'bg-indigo-100 text-indigo-700',
  IN_PROGRESS:    'bg-amber-100 text-amber-700',
  WAITING_DOC:    'bg-orange-100 text-orange-700',
  WAITING_REVIEW: 'bg-purple-100 text-purple-700',
  REVISION:       'bg-pink-100 text-pink-700',
  COMPLETED:      'bg-green-100 text-green-700',
  OVERDUE:        'bg-red-100 text-red-700',
  PENDING:        'bg-gray-100 text-gray-600',
}

const DEPT_LABELS: Record<string, string> = {
  DEBT:    'ฝ่ายเร่งรัดหนี้',
  LAW:     'ฝ่ายกฎหมาย',
  ASSET:   'ฝ่ายสืบทรัพย์',
  ENFORCE: 'ฝ่ายบังคับคดี',
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Timeline Component ────────────────────────────────────────────────────────

function CaseTimeline({ histories }: { histories: StatusHistory[] }) {
  if (histories.length === 0) {
    return <p className="text-sm text-gray-400 italic">ยังไม่มีการอัพเดทสถานะ</p>
  }
  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-green-200" />
      {histories.map((h, i) => (
        <div key={h.id} className="relative mb-4 last:mb-0">
          <div className={`absolute -left-4 mt-1 w-3 h-3 rounded-full border-2 border-white ${i === histories.length - 1 ? 'bg-green-600' : 'bg-green-300'}`} />
          <div className="ml-2">
            <div className="font-medium text-sm text-gray-800">{h.status}</div>
            {h.note && <div className="text-xs text-gray-500 mt-0.5">{h.note}</div>}
            <div className="text-xs text-gray-400 mt-0.5">{fmtDate(h.createdAt)} · {h.changedByName}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

interface Props { userId: string; userName: string }

export default function ClientDashboard({ userName }: Props) {
  const searchParams = useSearchParams()
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, completed: 0, upcoming: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Task | null>(null)
  const [q,  setQ]  = useState('')
  const [tab, setTab] = useState<'all' | 'active' | 'completed'>('all')
  const [activeNav, setActiveNav] = useState<'cases' | 'docs' | 'messages'>('cases')

  useEffect(() => {
    const nav = searchParams.get('nav')
    if (nav === 'messages' || nav === 'docs' || nav === 'cases') {
      setActiveNav(nav === 'cases' ? 'cases' : nav)
    }
  }, [searchParams])

  // Notifications
  const [notifCount, setNotifCount] = useState(0)

  const fetchCases = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (tab === 'active')    params.set('status', 'IN_PROGRESS')
    if (tab === 'completed') params.set('status', 'COMPLETED')

    const res = await fetch(`/api/client-portal/cases?${params}`)
    if (res.ok) {
      const data = await res.json()
      setTasks(data.tasks)
      setSummary(data.summary)
    }
    setLoading(false)
  }, [q, tab])

  useEffect(() => { fetchCases() }, [fetchCases])

  useEffect(() => {
    fetch('/api/notifications?unread=true')
      .then((r) => r.json())
      .then((d) => setNotifCount(d?.unreadCount ?? 0))
      .catch(() => {})
  }, [])

  const displayedTasks = tasks

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm">KM</div>
          <div>
            <div className="font-semibold text-gray-800 text-sm leading-tight">KM Service Plus</div>
            <div className="text-xs text-gray-500">ติดตามสถานะคดี</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-800">{userName}</div>
            <div className="text-xs text-gray-500">ลูกค้า</div>
          </div>
          {notifCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-medium">{notifCount}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded border border-gray-200 hover:border-red-200 transition-colors">
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* ── Summary Cards ── */}
      <div className="px-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'คดีทั้งหมด',      value: summary.total,     color: 'bg-green-50    text-green-700',   dot: 'bg-green-400'  },
          { label: 'กำลังดำเนินการ', value: summary.active,    color: 'bg-amber-50   text-amber-700',  dot: 'bg-amber-400' },
          { label: 'เสร็จสิ้น',       value: summary.completed, color: 'bg-green-50   text-green-700',  dot: 'bg-green-400' },
          { label: 'นัดศาลใน 30 วัน', value: summary.upcoming,  color: 'bg-purple-50  text-purple-700', dot: 'bg-purple-400'},
        ].map((c) => (
          <div key={c.label} className={`rounded-xl p-3 sm:p-4 ${c.color}`}>
            <div className="text-2xl sm:text-3xl font-bold">{c.value}</div>
            <div className="text-xs mt-1 font-medium opacity-80">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Nav tabs ── */}
      <div className="px-4 pt-4 flex gap-1">
        {([['cases', 'คดีของฉัน'], ['docs', 'เอกสาร'], ['messages', 'ข้อความ']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setActiveNav(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeNav === k ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Cases view ── */}
      {activeNav === 'cases' && (
        <div className="flex-1 px-4 pt-3 pb-6 flex flex-col gap-4 lg:flex-row">
          {/* Case list */}
          <div className="lg:w-96 shrink-0 flex flex-col gap-3">
            {/* Search + filter */}
            <div className="flex gap-2">
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCases()}
                placeholder="ค้นหาเลขคดี / ชื่อ..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => fetchCases()}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">ค้นหา</button>
            </div>
            <div className="flex gap-1">
              {([['all', 'ทั้งหมด'], ['active', 'กำลังดำเนิน'], ['completed', 'เสร็จสิ้น']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tab === k ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลด...</div>
            ) : displayedTasks.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">ไม่พบคดี</div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedTasks.map((t) => (
                  <button key={t.id} onClick={() => setSelected(t)}
                    className={`text-left border rounded-xl p-3 transition-all ${selected?.id === t.id ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-800 truncate">{t.title}</div>
                        {t.caseNumber && <div className="text-xs text-gray-500">เลขคดี: {t.caseNumber}</div>}
                        {t.taskDepartment && <div className="text-xs text-gray-400">{DEPT_LABELS[t.taskDepartment] ?? t.taskDepartment}</div>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                      {t.courtDate && <span>ศาล: {fmtDate(t.courtDate)}</span>}
                      {t.dueDate   && <span>ครบ: {fmtDate(t.dueDate)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Case detail */}
          {selected ? (
            <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 sm:p-6 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg leading-tight">{selected.title}</h2>
                  {selected.caseNumber && <div className="text-sm text-gray-500 mt-0.5">เลขคดี: {selected.caseNumber}</div>}
                </div>
                <span className={`text-sm px-3 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[selected.status] ?? ''}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-gray-400 text-xs block">ฝ่ายรับผิดชอบ</span>{DEPT_LABELS[selected.taskDepartment ?? ''] ?? selected.taskDepartment ?? '-'}</div>
                <div><span className="text-gray-400 text-xs block">ผู้รับผิดชอบ</span>{selected.assignee.name}</div>
                <div><span className="text-gray-400 text-xs block">วันที่รับเรื่อง</span>{fmtDate(selected.createdAt)}</div>
                <div><span className="text-gray-400 text-xs block">ครบกำหนด</span>{fmtDate(selected.dueDate)}</div>
                {selected.courtDate && <div><span className="text-gray-400 text-xs block">วันนัดศาล</span><span className="text-purple-700 font-medium">{fmtDate(selected.courtDate)}</span></div>}
                {selected.appointmentDate && <div><span className="text-gray-400 text-xs block">วันนัดหมาย</span>{fmtDate(selected.appointmentDate)}</div>}
                {selected.appointmentPlace && <div><span className="text-gray-400 text-xs block">สถานที่นัด</span>{selected.appointmentPlace}</div>}
              </div>

              <div>
                <div className="font-medium text-gray-700 mb-3 text-sm">ความคืบหน้า</div>
                <CaseTimeline histories={selected.statusHistories} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Link href={`/client-portal/messages?caseId=${selected.id}`}
                  className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                  ส่งข้อความ
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-sm min-h-48">
              เลือกคดีเพื่อดูรายละเอียด
            </div>
          )}
        </div>
      )}

      {/* ── Documents view ── */}
      {activeNav === 'docs' && <DocumentsView />}

      {/* ── Messages view ── */}
      {activeNav === 'messages' && <MessagesView userName={userName} />}
    </div>
  )
}

// ── Documents sub-view ────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  OTHER:     'เอกสารทั่วไป', COMPLAINT: 'คำฟ้อง', PETITION: 'คำร้อง',
  COURT:     'เอกสารศาล',   POA:       'หนังสือมอบอำนาจ', EVIDENCE: 'หลักฐานคดี',
  REPORT:    'รายงานติดตาม', DEBTOR:   'เอกสารลูกหนี้',  INTERNAL: 'เอกสารภายใน',
}

function DocumentsView() {
  const [docs,    setDocs]    = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/client-portal/documents')
      .then((r) => r.json())
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>

  type DocFile = { id: string; fileName: string; fileUrl: string; fileType: string; version: number }
  type Doc = { id: string; title: string; docType: string; createdAt: string; files: DocFile[] }

  return (
    <div className="flex-1 px-4 pt-3 pb-6">
      <div className="font-medium text-gray-700 mb-3">เอกสารทั้งหมด ({docs.length})</div>
      {docs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">ยังไม่มีเอกสาร</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(docs as Doc[]).map((doc) => (
            <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
              <div>
                <div className="font-medium text-sm text-gray-800">{doc.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                {doc.files.map((f) => (
                  <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-green-600 hover:underline bg-green-50 rounded-lg px-3 py-2">
                    <span>📄</span>
                    <span className="flex-1 truncate">{f.fileName}</span>
                    <span className="shrink-0 text-gray-400">v{f.version}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Messages sub-view ─────────────────────────────────────────────────────────

function MessagesView({ userName }: { userName: string }) {
  const [msgs,    setMsgs]    = useState<{ id: string; senderName: string; isFromClient: boolean; content: string; createdAt: string }[]>([])
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchMsgs = useCallback(() => {
    fetch('/api/client-portal/messages')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setMsgs(d))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchMsgs() }, [fetchMsgs])

  async function send() {
    if (!content.trim()) return
    setSending(true)
    const res = await fetch('/api/client-portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) { setContent(''); fetchMsgs() }
    setSending(false)
  }

  return (
    <div className="flex-1 px-4 pt-3 pb-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
      <div className="font-medium text-gray-700">ข้อความ</div>
      <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 min-h-64 max-h-[60dvh] overflow-y-auto">
        {loading && <div className="text-center text-gray-400 text-sm">กำลังโหลด...</div>}
        {!loading && msgs.length === 0 && <div className="text-center text-gray-400 text-sm">ยังไม่มีข้อความ</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.isFromClient ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${m.isFromClient ? 'bg-green-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
              <div className={`text-xs mb-1 font-medium ${m.isFromClient ? 'text-green-200' : 'text-gray-500'}`}>{m.isFromClient ? userName : m.senderName}</div>
              <div>{m.content}</div>
              <div className={`text-xs mt-1 ${m.isFromClient ? 'text-green-200' : 'text-gray-400'}`}>
                {new Date(m.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={content} onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="พิมพ์ข้อความ..." className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm" />
        <button onClick={send} disabled={sending || !content.trim()}
          className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-green-700">
          ส่ง
        </button>
      </div>
    </div>
  )
}
