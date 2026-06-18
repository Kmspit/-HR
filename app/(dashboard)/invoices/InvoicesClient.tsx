'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem { description: string; qty: number; unitPrice: number; amount: number }
interface User { id: string; name: string; role: string; department: string | null }
interface Company { id: string; clientCode: string; companyName: string }

interface Invoice {
  id: string; invoiceNumber: string; clientName: string; clientTaxId?: string
  clientAddress?: string; serviceType: string; lineItems: string
  subtotal: number; vatRate: number; vatAmount: number
  whtRate: number; whtAmount: number; totalAmount: number
  status: string; issueDate: string; dueDate: string
  paidAmount: number; remainingAmount: number; note?: string
  clientCompany?: Company; task?: { id: string; title: string; caseNumber?: string }
  createdBy: User; approvedBy?: User
  createdAt: string; updatedAt: string
  _count?: { payments: number; receipts: number }
  payments?: Payment[]; receipts?: Receipt[]
}

interface Payment {
  id: string; amount: number; paidAt: string; paymentMethod: string
  bankAccount?: string; slipUrl?: string; note?: string
  receivedBy?: User; createdBy: User
}

interface Receipt {
  id: string; receiptNumber: string; amount: number; vatAmount: number
  whtAmount: number; totalAmount: number; receiverName: string
  issuedAt: string; note?: string; createdBy: User
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PENDING_PAYMENT', 'PAID', 'OVERDUE', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  DRAFT:           'bg-gray-100 text-gray-600',
  SENT:            'bg-blue-100 text-blue-700',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-700',
  PAID:            'bg-green-100 text-green-700',
  OVERDUE:         'bg-red-100 text-red-700',
  CANCELLED:       'bg-gray-100 text-gray-400',
}
const STATUS_TH: Record<string, string> = {
  DRAFT:           'แบบร่าง', SENT: 'ส่งแล้ว',
  PENDING_PAYMENT: 'รอชำระ',  PAID: 'ชำระแล้ว',
  OVERDUE:         'เกินกำหนด', CANCELLED: 'ยกเลิก',
}
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'QR Payment', 'Other']
const FINANCE_ROLES   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000)

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvoicesClient({ userId, userRole }: { userId: string; userRole: string }) {
  const canManage = FINANCE_ROLES.includes(userRole)
  const [invoices,  setInvoices]  = useState<Invoice[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [q,         setQ]         = useState('')
  const [filterSt,  setFilterSt]  = useState('')
  const [overdue,   setOverdue]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<Invoice | null>(null)
  const [detailTab, setDetailTab] = useState<'info'|'payments'|'receipts'>('info')
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/invoices?q=${encodeURIComponent(q)}&status=${filterSt}&overdue=${overdue}&page=${page}`)
    if (r.ok) { const d = await r.json(); setInvoices(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, filterSt, overdue, page])

  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/invoices/${id}`)
    if (r.ok) setSelected(await r.json())
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/invoices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    load(); if (selected?.id === id) loadDetail(id)
  }

  const pages = Math.ceil(total / 50)

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ใบแจ้งหนี้</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoice Management ({total.toLocaleString()} รายการ)</p>
        </div>
        <div className="flex gap-2">
          {canManage && <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">+ สร้างใบแจ้งหนี้</button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาเลขใบแจ้งหนี้ / ลูกค้า…" className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56" />
        <select value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">ทุกสถานะ</option>
          {INVOICE_STATUSES.map(s => <option key={s} value={s}>{STATUS_TH[s]}</option>)}
        </select>
        <button onClick={() => { setOverdue(!overdue); setPage(1) }} className={`text-sm px-4 py-2 rounded-lg border transition-colors ${overdue ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
          ⚠️ เกินกำหนด
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: list */}
        <div className="flex flex-col gap-2 w-80 flex-shrink-0 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">กำลังโหลด…</p>
          ) : invoices.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">ไม่พบรายการ</p>
          ) : invoices.map(inv => {
            const days = daysLeft(inv.dueDate)
            const late = inv.status !== 'PAID' && inv.status !== 'CANCELLED' && days < 0
            const warn = inv.status !== 'PAID' && inv.status !== 'CANCELLED' && days >= 0 && days <= 7
            return (
              <button key={inv.id} onClick={() => { loadDetail(inv.id); setDetailTab('info') }} className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === inv.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-mono">{inv.invoiceNumber}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{inv.clientName}</p>
                    <p className="text-xs text-gray-500">{inv.serviceType}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium block mb-1 ${STATUS_COLORS[inv.status]}`}>{STATUS_TH[inv.status]}</span>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">฿{fmt(inv.totalAmount)}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
                  <span>ครบ {fmtDate(inv.dueDate)}</span>
                  {late && <span className="text-red-600 font-medium">เกิน {Math.abs(days)}ว.</span>}
                  {warn && !late && <span className="text-orange-600 font-medium">เหลือ {days}ว.</span>}
                  {inv.remainingAmount > 0 && inv.status !== 'CANCELLED' && !late && !warn && (
                    <span className="text-blue-600">ค้าง ฿{fmt(inv.remainingAmount)}</span>
                  )}
                </div>
              </button>
            )
          })}
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 py-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 rounded border disabled:opacity-40">‹</button>
              <span>{page} / {pages}</span>
              <button onClick={() => setPage(p => p+1)} disabled={page>=pages} className="px-2 py-1 rounded border disabled:opacity-40">›</button>
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <InvoiceDetail
              invoice={selected}
              userId={userId}
              userRole={userRole}
              canManage={canManage}
              activeTab={detailTab}
              setActiveTab={setDetailTab}
              onRefresh={() => { loadDetail(selected.id); load() }}
              onStatusChange={updateStatus}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center"><div className="text-5xl mb-3">📄</div><p className="text-sm">เลือกใบแจ้งหนี้เพื่อดูรายละเอียด</p></div>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <InvoiceModal
          userId={userId}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Invoice detail panel ─────────────────────────────────────────────────────

function InvoiceDetail({ invoice, userId, userRole, canManage, activeTab, setActiveTab, onRefresh, onStatusChange }: {
  invoice: Invoice; userId: string; userRole: string; canManage: boolean
  activeTab: 'info'|'payments'|'receipts'
  setActiveTab: (t: 'info'|'payments'|'receipts') => void
  onRefresh: () => void; onStatusChange: (id: string, s: string) => void
}) {
  const tabs = [
    { key: 'info' as const,     label: 'รายละเอียด' },
    { key: 'payments' as const, label: `ชำระเงิน (${invoice.payments?.length ?? 0})` },
    { key: 'receipts' as const, label: `ใบเสร็จ (${invoice.receipts?.length ?? 0})` },
  ]

  const days = daysLeft(invoice.dueDate)
  const isOverdue = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && days < 0

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400 font-mono">{invoice.invoiceNumber}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{invoice.clientName}</h2>
            <p className="text-sm text-gray-500">{invoice.serviceType}</p>
            {invoice.clientTaxId && <p className="text-xs text-gray-400">เลขภาษี: {invoice.clientTaxId}</p>}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[invoice.status]}`}>{STATUS_TH[invoice.status]}</span>
            <p className="text-xl font-bold text-gray-900 dark:text-white">฿{fmt(invoice.totalAmount)}</p>
            {invoice.remainingAmount > 0 && invoice.status !== 'CANCELLED' && (
              <p className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>ค้างชำระ ฿{fmt(invoice.remainingAmount)}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {canManage && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {invoice.status === 'DRAFT' && (
              <button onClick={() => onStatusChange(invoice.id, 'SENT')} className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">ส่งใบแจ้งหนี้</button>
            )}
            {['SENT', 'PENDING_PAYMENT', 'OVERDUE'].includes(invoice.status) && (
              <button onClick={() => setActiveTab('payments')} className="text-sm px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg">บันทึกการรับชำระ</button>
            )}
            {invoice.status === 'PAID' && (invoice.receipts?.length ?? 0) === 0 && (
              <button onClick={async () => {
                await fetch(`/api/invoices/${invoice.id}/receipt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverName: invoice.clientName }) })
                onRefresh()
              }} className="text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">ออกใบเสร็จ</button>
            )}
            {!['PAID', 'CANCELLED'].includes(invoice.status) && (
              <button onClick={() => onStatusChange(invoice.id, 'CANCELLED')} className="text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:text-red-600">ยกเลิก</button>
            )}
            <Link href={`/invoices/${invoice.id}/print`} target="_blank" className="text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">🖨️ พิมพ์ PDF</Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 px-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`text-sm px-3 py-2.5 whitespace-nowrap border-b-2 transition-colors ${activeTab===t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info'     && <InvoiceInfoTab     invoice={invoice} />}
        {activeTab === 'payments' && <PaymentsTab        invoice={invoice} onRefresh={onRefresh} canManage={canManage} />}
        {activeTab === 'receipts' && <ReceiptsTab        invoice={invoice} onRefresh={onRefresh} canManage={canManage} />}
      </div>
    </div>
  )
}

// ─── Info tab ─────────────────────────────────────────────────────────────────

function InvoiceInfoTab({ invoice }: { invoice: Invoice }) {
  let lineItems: LineItem[] = []
  try { lineItems = JSON.parse(invoice.lineItems) } catch {}

  return (
    <div className="space-y-4 text-sm">
      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-xs text-gray-400 mb-0.5">วันออกบิล</p><p className="font-medium">{fmtDate(invoice.issueDate)}</p></div>
        <div><p className="text-xs text-gray-400 mb-0.5">วันครบกำหนด</p><p className={`font-medium ${daysLeft(invoice.dueDate) < 0 && invoice.status !== 'PAID' ? 'text-red-600' : ''}`}>{fmtDate(invoice.dueDate)}</p></div>
        {invoice.clientCompany && <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">บริษัทในระบบ</p><p>{invoice.clientCompany.companyName} ({invoice.clientCompany.clientCode})</p></div>}
        {invoice.clientAddress && <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">ที่อยู่</p><p>{invoice.clientAddress}</p></div>}
        {invoice.task && <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">คดี</p><p>{invoice.task.title}{invoice.task.caseNumber ? ` [${invoice.task.caseNumber}]` : ''}</p></div>}
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">รายการบริการ</p>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[380px]">
              <thead className="bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {['รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'รวม'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {lineItems.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 px-3">{item.description}</td>
                    <td className="py-2 px-3">{item.qty}</td>
                    <td className="py-2 px-3">฿{fmt(item.unitPrice)}</td>
                    <td className="py-2 px-3 font-medium">฿{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-2">
        {([
          ['ยอดก่อนภาษี',      `฿${fmt(invoice.subtotal)}`],
          [`VAT ${(invoice.vatRate * 100).toFixed(0)}%`, `฿${fmt(invoice.vatAmount)}`],
          ...(invoice.whtRate > 0 ? [[`หัก ณ ที่จ่าย ${(invoice.whtRate * 100).toFixed(0)}%`, `-฿${fmt(invoice.whtAmount)}`]] : []),
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex justify-between">
            <span className="text-gray-500">{label}</span>
            <span>{val}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold">
          <span>ยอดสุทธิ</span><span className="text-lg">฿{fmt(invoice.totalAmount)}</span>
        </div>
        {invoice.paidAmount > 0 && (
          <>
            <div className="flex justify-between text-green-600"><span>ชำระแล้ว</span><span>฿{fmt(invoice.paidAmount)}</span></div>
            <div className={`flex justify-between font-semibold ${invoice.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              <span>คงค้าง</span><span>฿{fmt(invoice.remainingAmount)}</span>
            </div>
          </>
        )}
      </div>

      {invoice.note && <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-900/30"><p className="text-xs text-gray-400 mb-1">หมายเหตุ</p><p className="text-sm">{invoice.note}</p></div>}
      <p className="text-xs text-gray-400">สร้างโดย {invoice.createdBy.name} · {fmtDate(invoice.createdAt)}</p>
    </div>
  )
}

// ─── Payments tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ invoice, onRefresh, canManage }: { invoice: Invoice; onRefresh: () => void; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ amount: String(invoice.remainingAmount), paidAt: new Date().toISOString().slice(0, 10), paymentMethod: 'Bank Transfer', bankAccount: '', note: '' })
  const [saving,   setSaving]   = useState(false)

  const save = async () => {
    if (!form.amount) return
    setSaving(true)
    try {
      await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      setShowForm(false); onRefresh()
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const payments = invoice.payments ?? []
  return (
    <div className="space-y-3">
      {canManage && ['SENT', 'PENDING_PAYMENT', 'OVERDUE'].includes(invoice.status) && (
        <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-green-300 text-green-600 rounded-lg text-sm hover:bg-green-50">+ บันทึกการรับชำระ</button>
      )}
      {showForm && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 space-y-3 border border-green-200 dark:border-green-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">จำนวนเงิน (บาท) *</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่รับชำระ *</label>
              <input type="date" value={form.paidAt} onChange={e => setForm(f => ({...f, paidAt: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ช่องทางชำระ</label>
              <select value={form.paymentMethod} onChange={e => setForm(f => ({...f, paymentMethod: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ธนาคาร / เลขบัญชี</label>
              <input value={form.bankAccount} onChange={e => setForm(f => ({...f, bankAccount: e.target.value}))} placeholder="กรุงไทย xxx-x-xxxxx-x" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <input value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.amount} className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึกการรับชำระ'}</button>
          </div>
        </div>
      )}
      {payments.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีประวัติการชำระ</p>
      ) : payments.map(p => (
        <div key={p.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-green-600">+฿{fmt(p.amount)}</p>
              <p className="text-xs text-gray-500">{p.paymentMethod}{p.bankAccount ? ` · ${p.bankAccount}` : ''}</p>
              <p className="text-xs text-gray-400">{fmtDate(p.paidAt)} · รับโดย {p.receivedBy?.name ?? p.createdBy.name}</p>
              {p.note && <p className="text-xs text-gray-400">{p.note}</p>}
            </div>
            {p.slipUrl && <a href={p.slipUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">ดูสลิป</a>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Receipts tab ─────────────────────────────────────────────────────────────

function ReceiptsTab({ invoice, onRefresh, canManage }: { invoice: Invoice; onRefresh: () => void; canManage: boolean }) {
  const [saving, setSaving] = useState(false)

  const issueReceipt = async () => {
    setSaving(true)
    try {
      await fetch(`/api/invoices/${invoice.id}/receipt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverName: invoice.clientName }),
      })
      onRefresh()
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const receipts = invoice.receipts ?? []
  return (
    <div className="space-y-3">
      {canManage && invoice.status === 'PAID' && receipts.length === 0 && (
        <button onClick={issueReceipt} disabled={saving} className="w-full py-2 border-2 border-dashed border-purple-300 text-purple-600 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">{saving ? 'กำลังออกใบเสร็จ…' : '+ ออกใบเสร็จ'}</button>
      )}
      {receipts.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีใบเสร็จ</p>
      ) : receipts.map(r => (
        <div key={r.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs text-gray-400 mb-0.5">{r.receiptNumber}</p>
              <p className="font-semibold">฿{fmt(r.totalAmount)}</p>
              <p className="text-xs text-gray-500">ผู้รับ: {r.receiverName}</p>
              <p className="text-xs text-gray-400">{fmtDate(r.issuedAt)} · ออกโดย {r.createdBy.name}</p>
            </div>
            <Link href={`/invoices/${invoice.id}/print`} target="_blank" className="text-xs text-blue-600 hover:underline">🖨️ พิมพ์</Link>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Create invoice modal ─────────────────────────────────────────────────────

interface LineItemForm { description: string; qty: string; unitPrice: string }

function InvoiceModal({ userId, onClose, onSave }: { userId: string; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    clientName: '', clientTaxId: '', clientAddress: '',
    serviceType: '', issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '', vatRate: '0.07', whtRate: '0', note: '',
    clientCompanyId: '',
  })
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ description: '', qty: '1', unitPrice: '' }])
  const [companies, setCompanies] = useState<Company[]>([])
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    fetch('/api/client-companies?page=1').then(r => r.json()).then(d => setCompanies(d.items ?? []))
  }, [])

  const set = (k: string, v: string) => setForm(f => ({...f, [k]: v}))

  const updateLine = (i: number, k: string, v: string) => {
    setLineItems(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [k]: v }
      return updated
    }))
  }

  const addLine    = () => setLineItems(p => [...p, { description: '', qty: '1', unitPrice: '' }])
  const removeLine = (i: number) => setLineItems(p => p.filter((_, idx) => idx !== i))

  // Computed totals
  const items      = lineItems.map(l => ({ description: l.description, qty: Number(l.qty || 0), unitPrice: Number(l.unitPrice || 0), amount: Number(l.qty || 0) * Number(l.unitPrice || 0) }))
  const subtotal   = items.reduce((s, i) => s + i.amount, 0)
  const vatAmt     = Math.round(subtotal * Number(form.vatRate) * 100) / 100
  const whtAmt     = Math.round(subtotal * Number(form.whtRate) * 100) / 100
  const totalAmt   = subtotal + vatAmt - whtAmt

  // Auto-fill from company selection
  const selectCompany = (id: string) => {
    const c = companies.find(x => x.id === id)
    if (c) setForm(f => ({ ...f, clientCompanyId: id, clientName: c.companyName }))
    else   setForm(f => ({ ...f, clientCompanyId: '' }))
  }

  const save = async () => {
    if (!form.clientName || !form.serviceType || !form.issueDate || !form.dueDate) return
    setSaving(true)
    try {
      await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          clientCompanyId: form.clientCompanyId || null,
          lineItems: items,
          subtotal,
          vatRate:  Number(form.vatRate),
          whtRate:  Number(form.whtRate),
        }),
      })
      onSave()
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">สร้างใบแจ้งหนี้ใหม่</h2>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Company picker */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">เลือกลูกค้าในระบบ (ถ้ามี)</label>
              <select value={form.clientCompanyId} onChange={e => selectCompany(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="">— ไม่ระบุ / กรอกเอง —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.companyName} ({c.clientCode})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'clientName',    label: 'ชื่อลูกค้า *',          placeholder: 'บริษัท ABC จำกัด' },
                { key: 'clientTaxId',   label: 'เลขผู้เสียภาษี',         placeholder: '0105xxxxxxxxx' },
                { key: 'serviceType',   label: 'ประเภทบริการ *',          placeholder: 'เร่งรัดหนี้สิน' },
                { key: 'issueDate',     label: 'วันออกบิล *',             placeholder: '', type: 'date' },
                { key: 'dueDate',       label: 'วันครบกำหนด *',           placeholder: '', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">ที่อยู่ลูกค้า</label>
                <input value={form.clientAddress} onChange={e => set('clientAddress', e.target.value)} placeholder="เลขที่ ถนน แขวง เขต กรุงเทพฯ" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">รายการบริการ</p>
                <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ เพิ่มรายการ</button>
              </div>
              <div className="space-y-2">
                {lineItems.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="รายการ" className="col-span-6 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <input type="number" value={l.qty} onChange={e => updateLine(i, 'qty', e.target.value)} placeholder="จำนวน" className="col-span-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <input type="number" value={l.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} placeholder="ราคา" className="col-span-3 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <button onClick={() => removeLine(i)} disabled={lineItems.length === 1} className="col-span-1 text-red-400 hover:text-red-600 text-lg disabled:opacity-30">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tax */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className="text-xs text-gray-500 mb-1 block">ยอดก่อนภาษี</label><p className="text-sm font-semibold p-2">฿{fmt(subtotal)}</p></div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">VAT (%)</label>
                <select value={form.vatRate} onChange={e => set('vatRate', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="0">0%</option>
                  <option value="0.07">7%</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หัก ณ ที่จ่าย (%)</label>
                <select value={form.whtRate} onChange={e => set('whtRate', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="0">0%</option>
                  <option value="0.01">1%</option>
                  <option value="0.015">1.5%</option>
                  <option value="0.03">3%</option>
                  <option value="0.05">5%</option>
                </select>
              </div>
            </div>

            {/* Total summary */}
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ยอดก่อนภาษี</span><span>฿{fmt(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VAT {(Number(form.vatRate) * 100).toFixed(0)}%</span><span>฿{fmt(vatAmt)}</span></div>
              {Number(form.whtRate) > 0 && <div className="flex justify-between"><span className="text-gray-500">หัก ณ ที่จ่าย {(Number(form.whtRate) * 100).toFixed(0)}%</span><span>-฿{fmt(whtAmt)}</span></div>}
              <div className="border-t border-blue-100 dark:border-blue-800 pt-1 flex justify-between font-bold"><span>ยอดสุทธิ</span><span className="text-blue-600">฿{fmt(totalAmt)}</span></div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
            </div>
          </div>
          <div className="p-6 pt-0 flex gap-3 justify-end border-t border-gray-200 dark:border-gray-700 mt-4">
            <button onClick={onClose} className="px-5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.clientName || !form.serviceType || !form.issueDate || !form.dueDate} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'สร้างใบแจ้งหนี้'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
