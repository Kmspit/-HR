'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Receipt {
  id: string; receiptNumber: string; amount: number
  vatAmount: number; whtAmount: number; totalAmount: number
  receiverName: string; issuedAt: string; note?: string
  createdBy: { id: string; name: string }
  invoice: {
    invoiceNumber: string; clientName: string
    clientCompany?: { companyName: string }
  }
  payment?: { paymentMethod: string; bankAccount?: string }
}

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ReceiptsClient({ userId, userRole }: { userId: string; userRole: string }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [q,        setQ]        = useState('')
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/receipts?q=${encodeURIComponent(q)}&page=${page}`)
    if (r.ok) { const d = await r.json(); setReceipts(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, page])

  useEffect(() => { load() }, [load])

  const pages = Math.ceil(total / 50)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ใบเสร็จรับเงิน</h1>
          <p className="text-sm text-gray-500 mt-0.5">Receipt Register ({total.toLocaleString()} รายการ)</p>
        </div>
        <Link href="/invoices" className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50">← ใบแจ้งหนี้</Link>
      </div>

      {/* Search */}
      <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาเลขใบเสร็จ / ชื่อลูกค้า…" className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 max-w-md" />

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-12">กำลังโหลด…</p>
        ) : receipts.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">ไม่พบใบเสร็จ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                  {['เลขใบเสร็จ', 'ลูกค้า', 'อ้างอิงใบแจ้งหนี้', 'ยอดเงิน', 'ช่องทาง', 'วันที่ออก', ''].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {receipts.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-purple-600 font-semibold">{r.receiptNumber}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium">{r.receiverName}</p>
                      {r.invoice.clientCompany && <p className="text-xs text-gray-400">{r.invoice.clientCompany.companyName}</p>}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">{r.invoice.invoiceNumber}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-green-600">฿{fmt(r.totalAmount)}</p>
                      {r.vatAmount > 0 && <p className="text-xs text-gray-400">VAT ฿{fmt(r.vatAmount)}</p>}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{r.payment?.paymentMethod ?? '—'}{r.payment?.bankAccount ? ` · ${r.payment.bankAccount}` : ''}</td>
                    <td className="py-3 px-4 text-gray-600">{fmtDate(r.issuedAt)}</td>
                    <td className="py-3 px-4">
                      <Link href={`/invoices`} className="text-xs text-green-600 hover:underline mr-2">ดูใบแจ้งหนี้</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">‹ ก่อนหน้า</button>
          <span className="text-gray-500">หน้า {page} / {pages}</span>
          <button onClick={() => setPage(p => p+1)} disabled={page>=pages} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">ถัดไป ›</button>
        </div>
      )}
    </div>
  )
}
