'use client'

import { useState, useEffect, useCallback } from 'react'
import { useModalA11y } from '@/hooks/useModalA11y'

interface User { id: string; name: string; department: string | null; role: string }

interface FollowUpEntry {
  id: string
  method: string
  followedAt: string
  result: string
  note?: string
  nextFollowUp?: string
  performedBy: User
  createdAt: string
  debtor: { id: string; debtorNumber: string; firstName: string; lastName: string; phone?: string }
}

interface DebtorOption { id: string; debtorNumber: string; firstName: string; lastName: string }

const FOLLOW_METHODS = ['โทรศัพท์', 'LINE', 'SMS', 'Email', 'เข้าพบ']
const METHOD_COLORS: Record<string, string> = {
  'โทรศัพท์': 'bg-green-100 text-green-700',
  'LINE':     'bg-green-100 text-green-700',
  'SMS':      'bg-purple-100 text-purple-700',
  'Email':    'bg-orange-100 text-orange-700',
  'เข้าพบ':  'bg-red-100 text-red-700',
}
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDT   = (d: string)  => new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })

export default function DebtFollowupClient({ userId, userRole }: { userId: string; userRole: string }) {
  const [items,     setItems]     = useState<FollowUpEntry[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [q,         setQ]         = useState('')
  const [method,    setMethod]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const formPanelRef = useModalA11y(showForm)
  const [debtors,   setDebtors]   = useState<DebtorOption[]>([])
  const [searchDeb, setSearchDeb] = useState('')
  const [selDebtor, setSelDebtor] = useState<DebtorOption | null>(null)

  // Form fields
  const [fMethod,   setFMethod]   = useState(FOLLOW_METHODS[0])
  const [fAt,       setFAt]       = useState(new Date().toISOString().slice(0, 16))
  const [fResult,   setFResult]   = useState('')
  const [fNote,     setFNote]     = useState('')
  const [fNextFU,   setFNextFU]   = useState('')
  const [saving,    setSaving]    = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/debt-followup?q=${encodeURIComponent(q)}&method=${encodeURIComponent(method)}&page=${page}`)
    if (r.ok) { const d = await r.json(); setItems(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, method, page])

  useEffect(() => { loadItems() }, [loadItems])

  const searchDebtors = useCallback(async (query: string) => {
    if (!query) { setDebtors([]); return }
    const r = await fetch(`/api/debtors?q=${encodeURIComponent(query)}&limit=10`)
    if (r.ok) { const d = await r.json(); setDebtors(d.items ?? []) }
  }, [])

  useEffect(() => { searchDebtors(searchDeb) }, [searchDeb, searchDebtors])

  const save = async () => {
    if (!selDebtor || !fResult) return
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${selDebtor.id}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: fMethod, followedAt: fAt, result: fResult, note: fNote || null, nextFollowUp: fNextFU || null }),
      })
      if (r.ok) {
        setShowForm(false)
        setSelDebtor(null); setSearchDeb(''); setFResult(''); setFNote(''); setFNextFU('')
        loadItems()
      }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">การติดตามหนี้</h1>
          <p className="text-sm text-gray-500 mt-0.5">บันทึกการติดต่อลูกหนี้ทั้งหมด</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">+ บันทึกการติดตาม</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {FOLLOW_METHODS.map(m => {
          const cnt = items.filter(i => i.method === m).length
          return (
            <button key={m} onClick={() => setMethod(method === m ? '' : m)} className={`rounded-xl border p-3 text-sm text-center transition-colors ${method === m ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-green-300'}`}>
              <p className="font-semibold text-gray-900 dark:text-white">{cnt}</p>
              <p className="text-xs text-gray-500">{m}</p>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาผล / ชื่อลูกหนี้…" className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <select value={method} onChange={e => { setMethod(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">ทุกช่องทาง</option>
          {FOLLOW_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลด…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">ไม่พบข้อมูล</div>
        ) : items.map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[item.method] ?? 'bg-gray-100 text-gray-700'}`}>{item.method}</span>
                  <span className="text-xs text-gray-500">{fmtDT(item.followedAt)}</span>
                  <span className="text-xs text-gray-400">โดย: {item.performedBy.name}</span>
                </div>
                <a href={`/debtors`} className="text-sm font-semibold text-green-600 hover:underline">
                  {item.debtor.firstName} {item.debtor.lastName}
                </a>
                <span className="text-xs text-gray-400 ml-2 font-mono">{item.debtor.debtorNumber}</span>
                {item.debtor.phone && <span className="text-xs text-gray-400 ml-2">📱 {item.debtor.phone}</span>}
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{item.result}</p>
                {item.note && <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                {item.nextFollowUp && (
                  <p className="text-xs text-yellow-600 whitespace-nowrap">
                    📅 ครั้งถัดไป: {fmtDate(item.nextFollowUp)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
          <span>ทั้งหมด {total} รายการ</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border disabled:opacity-40">‹ ก่อนหน้า</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} className="px-3 py-1 rounded border disabled:opacity-40">ถัดไป ›</button>
          </div>
        </div>
      )}

      {/* Add follow-up modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-60 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div ref={formPanelRef} role="dialog" aria-modal aria-label="บันทึกการติดตามหนี้" tabIndex={-1} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">บันทึกการติดตามหนี้</h2>
              </div>
              <div className="p-5 space-y-4">
                {/* Debtor search */}
                <div>
                  <span className="text-xs text-gray-500 mb-1 block">เลือกลูกหนี้ *</span>
                  {selDebtor ? (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <span className="text-sm font-medium">{selDebtor.firstName} {selDebtor.lastName} <span className="text-xs text-gray-400 font-mono">({selDebtor.debtorNumber})</span></span>
                      <button onClick={() => { setSelDebtor(null); setSearchDeb('') }} className="text-xs text-red-500">เปลี่ยน</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={searchDeb} onChange={e => setSearchDeb(e.target.value)} placeholder="พิมพ์ชื่อ / เลขลูกหนี้…" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      {debtors.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                          {debtors.map(d => (
                            <button key={d.id} onClick={() => { setSelDebtor(d); setSearchDeb(''); setDebtors([]) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                              {d.firstName} {d.lastName} <span className="text-xs text-gray-400 font-mono">({d.debtorNumber})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="field-1" className="text-xs text-gray-500 mb-1 block">ช่องทาง</label>
                    <select id="field-1" value={fMethod} onChange={e => setFMethod(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      {FOLLOW_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="field-2" className="text-xs text-gray-500 mb-1 block">วันเวลา</label>
                    <input id="field-2" type="datetime-local" value={fAt} onChange={e => setFAt(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                </div>

                <div>
                  <label htmlFor="field-3" className="text-xs text-gray-500 mb-1 block">ผลการติดตาม *</label>
                  <textarea id="field-3" value={fResult} onChange={e => setFResult(e.target.value)} rows={3} placeholder="เช่น โทรแล้วรับสาย รับปากจะชำระวันที่..." className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="field-4" className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                    <input id="field-4" value={fNote} onChange={e => setFNote(e.target.value)} placeholder="เพิ่มเติม…" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label htmlFor="field-5" className="text-xs text-gray-500 mb-1 block">นัดติดตามครั้งถัดไป</label>
                    <input id="field-5" type="datetime-local" value={fNextFU} onChange={e => setFNextFU(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                </div>
              </div>

              <div className="p-5 pt-0 flex gap-3 justify-end">
                <button onClick={() => setShowForm(false)} className="px-5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
                <button onClick={save} disabled={saving || !selDebtor || !fResult} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
