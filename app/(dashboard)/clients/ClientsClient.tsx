'use client'

import { useState, useEffect, useCallback } from 'react'

interface ClientUser {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  department: string | null
  createdAt: string
  _count: { clientTasks: number; clientDocs: number }
}

interface ClientDetail {
  id: string
  name: string
  email: string
  phone: string | null
  department: string | null
  status: string
  createdAt: string
  clientTasks: {
    id: string; title: string; caseNumber: string | null
    clientName: string | null; status: string; taskDepartment: string | null
    dueDate: string | null; courtDate: string | null
  }[]
  clientDocs: { id: string; title: string; docType: string; status: string }[]
}

interface Task {
  id: string; title: string; caseNumber: string | null; status: string
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'รับเรื่อง', ASSIGNED: 'มอบหมาย', IN_PROGRESS: 'ดำเนินการ',
  WAITING_DOC: 'รอเอกสาร', COMPLETED: 'เสร็จสิ้น', OVERDUE: 'เกินกำหนด', PENDING: 'รอ',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props { userId: string; userRole: string }

export default function ClientsClient({ userRole }: Props) {
  const [clients, setClients] = useState<ClientUser[]>([])
  const [selected, setSelected] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', companyName: '' })
  const [creating, setCreating] = useState(false)

  // Status history modal
  const [showHistory, setShowHistory] = useState<{ taskId: string; taskTitle: string } | null>(null)
  const [historyForm, setHistoryForm] = useState({ status: '', note: '' })
  const [addingHistory, setAddingHistory] = useState(false)

  // Link task modal
  const [showLinkTask, setShowLinkTask] = useState(false)
  const [availableTasks, setAvailableTasks] = useState<Task[]>([])
  const [taskSearchQ, setTaskSearchQ] = useState('')

  const canDelete = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(userRole)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const res = await fetch(`/api/clients?${params}`)
    if (res.ok) setClients(await res.json())
    setLoading(false)
  }, [q])

  useEffect(() => { fetchClients() }, [fetchClients])

  async function openDetail(c: ClientUser) {
    const res = await fetch(`/api/clients/${c.id}`)
    if (res.ok) setSelected(await res.json())
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowCreate(false)
        setForm({ name: '', email: '', phone: '', password: '', companyName: '' })
        fetchClients()
      } else {
        const err = await res.json()
        alert(err.error ?? 'เกิดข้อผิดพลาด')
      }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบบัญชีลูกค้านี้?')) return
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    if (res.ok) { setSelected(null); fetchClients() }
  }

  async function handleUnlinkTask(taskId: string) {
    if (!selected) return
    await fetch(`/api/clients/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unlinkTaskId: taskId }),
    })
    const res = await fetch(`/api/clients/${selected.id}`)
    if (res.ok) setSelected(await res.json())
  }

  async function handleLinkTask(taskId: string) {
    if (!selected) return
    await fetch(`/api/clients/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkTaskId: taskId }),
    })
    setShowLinkTask(false)
    const res = await fetch(`/api/clients/${selected.id}`)
    if (res.ok) setSelected(await res.json())
  }

  async function fetchAvailableTasks(q: string) {
    const params = new URLSearchParams({ view: 'all' })
    if (q) params.set('q', q)
    const res = await fetch(`/api/tasks?${params}`)
    if (res.ok) {
      const data = await res.json()
      setAvailableTasks(data.tasks ?? data)
    }
  }

  async function addStatusHistory(e: React.FormEvent) {
    e.preventDefault()
    if (!showHistory || !historyForm.status.trim()) return
    setAddingHistory(true)
    try {
      const res = await fetch(`/api/tasks/${showHistory.taskId}/status-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyForm),
      })
      if (res.ok) {
        setShowHistory(null)
        setHistoryForm({ status: '', note: '' })
      }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setAddingHistory(false)
    }
  }

  const CLIENT_STATUSES = ['รับเรื่องแล้ว', 'กำลังดำเนินการ', 'ยื่นฟ้องแล้ว', 'รอศาล', 'อยู่ระหว่างบังคับคดี', 'เสร็จสิ้น']

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchClients()}
          placeholder="ค้นหาลูกค้า..."
          className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm min-w-48" />
        <button onClick={() => fetchClients()} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">ค้นหา</button>
        <button onClick={() => setShowCreate(true)} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 ml-auto">+ เพิ่มลูกค้า</button>
      </div>

      <div className="flex gap-4 items-start">
        {/* Client list */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-2">{clients.length} ลูกค้า</div>
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลด...</div>
          ) : clients.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">ยังไม่มีลูกค้า</div>
          ) : (
            <div className="flex flex-col gap-2">
              {clients.map((c) => (
                <div key={c.id} onClick={() => openDetail(c)}
                  className={`border rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors ${selected?.id === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm text-gray-800">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                      {c.department && <div className="text-xs text-gray-400">{c.department}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'ACTIVE' ? 'ใช้งาน' : 'ปิด'}
                      </span>
                      <div className="text-xs text-gray-400 mt-1">คดี {c._count.clientTasks} · เอกสาร {c._count.clientDocs}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-96 shrink-0 bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4 sticky top-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                <div className="text-xs text-gray-500">{selected.email}</div>
                {selected.department && <div className="text-xs text-gray-400">{selected.department}</div>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setShowLinkTask(true); fetchAvailableTasks('') }}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
                เชื่อมคดี
              </button>
              {canDelete && (
                <button onClick={() => handleDelete(selected.id)}
                  className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50">
                  ลบบัญชี
                </button>
              )}
            </div>

            {/* Linked tasks */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">คดีที่เชื่อมแล้ว ({selected.clientTasks.length})</div>
              {selected.clientTasks.length === 0 ? (
                <div className="text-xs text-gray-400">ยังไม่มีคดี</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selected.clientTasks.map((t) => (
                    <div key={t.id} className="border border-gray-100 rounded p-2 bg-gray-50 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{t.title}</div>
                        <div className="text-xs text-gray-500">{t.caseNumber ?? '-'} · {STATUS_LABELS[t.status] ?? t.status}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setShowHistory({ taskId: t.id, taskTitle: t.title })}
                          className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
                          สถานะ
                        </button>
                        <button onClick={() => handleUnlinkTask(t.id)}
                          className="text-xs px-1.5 py-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked docs */}
            {selected.clientDocs.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">เอกสาร ({selected.clientDocs.length})</div>
                <div className="flex flex-col gap-1">
                  {selected.clientDocs.map((d) => (
                    <div key={d.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">{d.title}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-400">สร้างเมื่อ {fmtDate(selected.createdAt)}</div>
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">เพิ่มบัญชีลูกค้า</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              {[
                { label: 'ชื่อ-นามสกุล *', key: 'name', type: 'text', req: true },
                { label: 'อีเมล *',          key: 'email', type: 'email', req: true },
                { label: 'เบอร์โทร',         key: 'phone', type: 'text', req: false },
                { label: 'บริษัท/หน่วยงาน', key: 'companyName', type: 'text', req: false },
                { label: 'รหัสผ่านเริ่มต้น *', key: 'password', type: 'password', req: true },
              ].map(({ label, key, type, req }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">{label}</label>
                  <input required={req} type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              ))}
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ยกเลิก</button>
                <button type="submit" disabled={creating}
                  className="px-5 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">
                  {creating ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* ── Status History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800 text-sm">อัพเดทสถานะคดี (ลูกค้าจะเห็น)</h2>
            <div className="text-xs text-gray-500">{showHistory.taskTitle}</div>
            <form onSubmit={addStatusHistory} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">สถานะ *</label>
                <select required value={historyForm.status}
                  onChange={(e) => setHistoryForm({ ...historyForm, status: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">-- เลือกสถานะ --</option>
                  {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">หมายเหตุ</label>
                <textarea rows={2} value={historyForm.note}
                  onChange={(e) => setHistoryForm({ ...historyForm, note: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม..." />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowHistory(null)}
                  className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ยกเลิก</button>
                <button type="submit" disabled={addingHistory}
                  className="px-5 py-2 rounded bg-amber-600 text-white text-sm disabled:opacity-50">
                  {addingHistory ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* ── Link Task Modal ── */}
      {showLinkTask && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[80vh]">
            <h2 className="font-semibold text-gray-800">เลือกคดีที่จะเชื่อม</h2>
            <div className="flex gap-2">
              <input value={taskSearchQ} onChange={(e) => setTaskSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchAvailableTasks(taskSearchQ)}
                placeholder="ค้นหาคดี / เลขคดี..." className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
              <button onClick={() => fetchAvailableTasks(taskSearchQ)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm">ค้นหา</button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
              {availableTasks.map((t) => (
                <button key={t.id} onClick={() => handleLinkTask(t.id)}
                  className="text-left border border-gray-200 rounded-lg p-2.5 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <div className="text-sm font-medium text-gray-800">{t.title}</div>
                  {t.caseNumber && <div className="text-xs text-gray-500">เลขคดี: {t.caseNumber}</div>}
                  <div className="text-xs text-gray-400">{STATUS_LABELS[t.status] ?? t.status}</div>
                </button>
              ))}
              {availableTasks.length === 0 && <div className="text-center text-gray-400 text-sm py-4">ค้นหาคดีก่อน</div>}
            </div>
            <button onClick={() => setShowLinkTask(false)} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ปิด</button>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
