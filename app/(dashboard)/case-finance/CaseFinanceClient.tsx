'use client'

import { useState, useEffect, useCallback } from 'react'
import { modalFieldInput, dashboardDialogPanel } from '@/lib/theme-classes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaseIncome {
  id: string; taskId?: string; caseNumber?: string; clientName?: string
  incomeType: string; amount: number; date: string; note?: string; department?: string
  createdBy: { id: string; name: string }
}
interface CaseExpense {
  id: string; taskId?: string; caseNumber?: string; expenseType: string
  amount: number; date: string; note?: string; department?: string; receiptUrl?: string
  employee: { id: string; name: string }; createdBy: { id: string; name: string }
}
interface Summary {
  totalIncome: number; totalExpense: number; totalClaims: number
  totalCost: number; netProfit: number; claimCount: number
  byDept: { department: string; income: number; expense: number; profit: number }[]
  byCase: { caseNumber: string; income: number; expense: number; profit: number }[]
  monthly: { month: number; income: number; expense: number; profit: number }[]
  incomeByType: Record<string, number>; expenseByType: Record<string, number>
}
interface Props { userId: string; userRole: string; userName: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const INCOME_TYPES  = ['ค่าดำเนินคดี','ค่าทนาย','ค่าติดตามหนี้','ค่าธรรมเนียม','รายรับอื่น']
const EXPENSE_TYPES = ['ค่าเดินทาง','ค่าน้ำมัน','ค่าศาล','ค่าถ่ายเอกสาร','ค่าไปรษณีย์','ค่าโรงแรม','ค่าใช้จ่ายอื่น']
const DEPT_LABELS: Record<string,string> = { DEBT:'เร่งรัดหนี้', LAW:'กฎหมาย', ASSET:'สืบทรัพย์', ENFORCE:'บังคับคดี' }
const CAN_MANAGE = ['SUPER_ADMIN','CEO','MANAGER_HR','HR','ADMIN','MANAGER']
const PIE_COLORS = ['#22c55e','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'}) }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CaseFinanceClient({ userRole }: Props) {
  const [tab,        setTab]        = useState<'dashboard'|'income'|'expense'>('dashboard')
  const [year,       setYear]       = useState(new Date().getFullYear())
  const [month,      setMonth]      = useState<number|null>(null)
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [incomes,    setIncomes]    = useState<CaseIncome[]>([])
  const [expenses,   setExpenses]   = useState<CaseExpense[]>([])
  const [employees,  setEmployees]  = useState<{id:string;name:string}[]>([])
  const [loading,    setLoading]    = useState(false)
  const [showModal,  setShowModal]  = useState<'income'|'expense'|null>(null)
  const [editItem,   setEditItem]   = useState<CaseIncome | CaseExpense | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [iq, setIq] = useState('')
  const [eq, setEq] = useState('')

  const canManage = CAN_MANAGE.includes(userRole)

  // Income form
  const emptyIncome = { incomeType: INCOME_TYPES[0], amount: '', date: new Date().toISOString().slice(0,10), caseNumber: '', clientName: '', department: '', note: '' }
  const [incomeForm, setIncomeForm] = useState(emptyIncome)

  // Expense form
  const emptyExpense = { expenseType: EXPENSE_TYPES[0], amount: '', date: new Date().toISOString().slice(0,10), caseNumber: '', department: '', employeeId: '', note: '' }
  const [expenseForm, setExpenseForm] = useState(emptyExpense)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const p = month ? `year=${year}&month=${month}` : `year=${year}`
      const r = await fetch(`/api/case-finance/summary?${p}`)
      if (r.ok) setSummary(await r.json())
    } finally { setLoading(false) }
  }, [year, month])

  const loadIncomes = useCallback(async (q = '') => {
    const r = await fetch(`/api/case-finance/income?q=${encodeURIComponent(q)}&page=1`)
    if (r.ok) { const d = await r.json(); setIncomes(d.items) }
  }, [])

  const loadExpenses = useCallback(async (q = '') => {
    const r = await fetch(`/api/case-finance/expenses?q=${encodeURIComponent(q)}&page=1`)
    if (r.ok) { const d = await r.json(); setExpenses(d.items) }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { if (tab === 'income')  loadIncomes() },  [tab, loadIncomes])
  useEffect(() => { if (tab === 'expense') loadExpenses() }, [tab, loadExpenses])

  useEffect(() => {
    fetch('/api/employees?status=ACTIVE&limit=200')
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? d.items ?? []))
      .catch(() => {})
  }, [])

  async function saveIncome(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const method = editItem ? 'PATCH' : 'POST'
      const url    = editItem ? `/api/case-finance/income/${editItem.id}` : '/api/case-finance/income'
      const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ ...incomeForm, amount: Number(incomeForm.amount) }) })
      if (r.ok) { setShowModal(null); setEditItem(null); setIncomeForm(emptyIncome); loadIncomes(); loadSummary() }
    } finally { setSaving(false) }
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const method = editItem ? 'PATCH' : 'POST'
      const url    = editItem ? `/api/case-finance/expenses/${editItem.id}` : '/api/case-finance/expenses'
      const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }) })
      if (r.ok) { setShowModal(null); setEditItem(null); setExpenseForm(emptyExpense); loadExpenses(); loadSummary() }
    } finally { setSaving(false) }
  }

  async function deleteIncome(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/case-finance/income/${id}`, { method: 'DELETE' })
    loadIncomes(); loadSummary()
  }

  async function deleteExpense(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/case-finance/expenses/${id}`, { method: 'DELETE' })
    loadExpenses(); loadSummary()
  }

  function openEdit(type: 'income'|'expense', item: CaseIncome | CaseExpense) {
    setEditItem(item); setShowModal(type)
    if (type === 'income') {
      const i = item as CaseIncome
      setIncomeForm({ incomeType: i.incomeType, amount: String(i.amount), date: i.date.slice(0,10), caseNumber: i.caseNumber??'', clientName: i.clientName??'', department: i.department??'', note: i.note??'' })
    } else {
      const ex = item as CaseExpense
      setExpenseForm({ expenseType: ex.expenseType, amount: String(ex.amount), date: ex.date.slice(0,10), caseNumber: ex.caseNumber??'', department: ex.department??'', employeeId: ex.employee.id, note: ex.note??'' })
    }
  }

  function exportCSV(type: 'income'|'expense') {
    const rows = type === 'income'
      ? [['วันที่','ประเภท','จำนวนเงิน','เลขคดี','ลูกค้า','ฝ่าย','หมายเหตุ'],
         ...incomes.map(i => [fmtDate(i.date), i.incomeType, i.amount, i.caseNumber??'', i.clientName??'', i.department??'', i.note??''])]
      : [['วันที่','ประเภท','จำนวนเงิน','เลขคดี','พนักงาน','ฝ่าย','หมายเหตุ'],
         ...expenses.map(e => [fmtDate(e.date), e.expenseType, e.amount, e.caseNumber??'', e.employee.name, e.department??'', e.note??''])]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' })
    const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${type}-${year}.csv` })
    a.click(); a.remove()
  }

  const profitColor = (n: number) => n >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">การเงินคดี</h1>
          <p className="text-sm text-gray-500">ติดตามรายรับ ค่าใช้จ่าย และกำไร/ขาดทุนของคดี</p>
        </div>
        <div className="sm:ml-auto flex gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <select value={month ?? ''} onChange={e => setMonth(e.target.value ? Number(e.target.value) : null)} className="border rounded px-2 py-1.5 text-sm">
            <option value="">ทั้งปี</option>
            {MONTH_TH.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['dashboard','income','expense'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===t ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'dashboard' ? '📊 ภาพรวม' : t === 'income' ? '💰 รายรับ' : '💸 ค่าใช้จ่าย'}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-5">
          {loading && <div className="text-center text-gray-400 py-8">กำลังโหลดข้อมูล...</div>}
          {summary && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'รายรับรวม',     value: summary.totalIncome,   color: 'bg-green-50 border-green-200', vColor: 'text-green-700' },
                  { label: 'ค่าใช้จ่ายรวม', value: summary.totalCost,     color: 'bg-red-50 border-red-200',     vColor: 'text-red-700' },
                  { label: 'กำไรสุทธิ',     value: summary.netProfit,     color: 'bg-green-50 border-green-200',   vColor: profitColor(summary.netProfit) },
                  { label: 'ค่าใช้จ่ายคดี', value: summary.totalExpense,  color: 'bg-orange-50 border-orange-200', vColor: 'text-orange-700' },
                  { label: 'ใบเบิก (อนุมัติ)', value: summary.totalClaims, color: 'bg-purple-50 border-purple-200', vColor: 'text-purple-700' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
                    <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                    <p className={`text-lg font-bold ${c.vColor}`}>฿{fmt(c.value)}</p>
                  </div>
                ))}
              </div>

              {/* Monthly chart */}
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3">รายรับ / ค่าใช้จ่าย รายเดือน {year + 543}</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.monthly.map(m => ({ ...m, name: MONTH_TH[m.month-1] }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} />
                    <Tooltip formatter={(v: unknown) => [`฿${fmt(Number(v ?? 0))}`]} />
                    <Legend />
                    <Bar dataKey="income"  name="รายรับ"       fill="#10b981" radius={[3,3,0,0] as [number,number,number,number]} />
                    <Bar dataKey="expense" name="ค่าใช้จ่าย"   fill="#ef4444" radius={[3,3,0,0] as [number,number,number,number]} />
                    <Bar dataKey="profit"  name="กำไร"          fill="#22c55e" radius={[3,3,0,0] as [number,number,number,number]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* By Dept */}
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-3">กำไร/ขาดทุน รายฝ่าย</h3>
                  <div className="space-y-2">
                    {summary.byDept.map(d => (
                      <div key={d.department} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 flex-shrink-0">{DEPT_LABELS[d.department] ?? d.department}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, d.income > 0 ? (d.income / (summary.totalIncome || 1)) * 100 : 0)}%` }} />
                        </div>
                        <span className={`text-xs font-medium w-20 text-right ${profitColor(d.profit)}`}>฿{fmt(d.profit)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Income by type pie */}
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-3">สัดส่วนรายรับตามประเภท</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={Object.entries(summary.incomeByType).map(([k,v]) => ({ name: k, value: v }))}
                        cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}
                        labelLine={false}>
                        {Object.keys(summary.incomeByType).map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => [`฿${fmt(Number(v ?? 0))}`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top cases */}
              {summary.byCase.length > 0 && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-3">กำไร/ขาดทุน รายคดี (Top 10)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-gray-500">
                        <th className="text-left pb-2 font-medium">เลขคดี</th>
                        <th className="text-right pb-2 font-medium">รายรับ</th>
                        <th className="text-right pb-2 font-medium">ค่าใช้จ่าย</th>
                        <th className="text-right pb-2 font-medium">กำไรสุทธิ</th>
                      </tr></thead>
                      <tbody>
                        {summary.byCase.map((c) => (
                          <tr key={c.caseNumber} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 text-gray-800">{c.caseNumber}</td>
                            <td className="py-2 text-right text-green-600">฿{fmt(c.income)}</td>
                            <td className="py-2 text-right text-red-500">฿{fmt(c.expense)}</td>
                            <td className={`py-2 text-right font-semibold ${profitColor(c.profit)}`}>฿{fmt(c.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── INCOME TAB ───────────────────────────────────────────────────── */}
      {tab === 'income' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex gap-2">
              <input value={iq} onChange={e => setIq(e.target.value)} onKeyDown={e => e.key==='Enter' && loadIncomes(iq)}
                placeholder="ค้นหา เลขคดี / ประเภท..." className="border rounded px-3 py-2 text-sm w-60" />
              <button onClick={() => loadIncomes(iq)} className="px-3 py-2 bg-gray-100 rounded text-sm">ค้นหา</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportCSV('income')} className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">⬇ Export CSV</button>
              {canManage && (
                <button onClick={() => { setEditItem(null); setIncomeForm(emptyIncome); setShowModal('income') }}
                  className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">+ เพิ่มรายรับ</button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>{['วันที่','ประเภท','เลขคดี','ลูกค้า','ฝ่าย','จำนวนเงิน','หมายเหตุ',canManage?'':''].filter(Boolean).map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {incomes.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">ไม่มีข้อมูล</td></tr>}
                  {incomes.map(i => (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{fmtDate(i.date)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">{i.incomeType}</span></td>
                      <td className="px-4 py-3 text-gray-700">{i.caseNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{i.clientName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{DEPT_LABELS[i.department??''] ?? i.department ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-green-700">฿{fmt(i.amount)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-32 truncate">{i.note ?? '—'}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit('income', i)} className="text-xs text-green-600 hover:underline">แก้ไข</button>
                            <button onClick={() => deleteIncome(i.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPENSE TAB ──────────────────────────────────────────────────── */}
      {tab === 'expense' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex gap-2">
              <input value={eq} onChange={e => setEq(e.target.value)} onKeyDown={e => e.key==='Enter' && loadExpenses(eq)}
                placeholder="ค้นหา เลขคดี / ประเภท..." className="border rounded px-3 py-2 text-sm w-60" />
              <button onClick={() => loadExpenses(eq)} className="px-3 py-2 bg-gray-100 rounded text-sm">ค้นหา</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportCSV('expense')} className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">⬇ Export CSV</button>
              {canManage && (
                <button onClick={() => { setEditItem(null); setExpenseForm(emptyExpense); setShowModal('expense') }}
                  className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">+ เพิ่มค่าใช้จ่าย</button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>{['วันที่','ประเภท','เลขคดี','พนักงาน','ฝ่าย','จำนวนเงิน','ใบเสร็จ',canManage?'':''].filter(Boolean).map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">ไม่มีข้อมูล</td></tr>}
                  {expenses.map(ex => (
                    <tr key={ex.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{fmtDate(ex.date)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">{ex.expenseType}</span></td>
                      <td className="px-4 py-3 text-gray-700">{ex.caseNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{ex.employee.name}</td>
                      <td className="px-4 py-3 text-gray-500">{DEPT_LABELS[ex.department??''] ?? ex.department ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">฿{fmt(ex.amount)}</td>
                      <td className="px-4 py-3">{ex.receiptUrl ? <a href={ex.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline">ดูใบเสร็จ</a> : '—'}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit('expense', ex)} className="text-xs text-green-600 hover:underline">แก้ไข</button>
                            <button onClick={() => deleteExpense(ex.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── INCOME MODAL ─────────────────────────────────────────────────── */}
      {showModal === 'income' && (
        <div className="fixed inset-0 bg-black/40 z-60 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className={`${dashboardDialogPanel} w-full max-w-lg p-6`}>
              <h2 className="font-semibold text-gray-800 text-lg mb-4">{editItem ? 'แก้ไขรายรับ' : 'เพิ่มรายรับคดี'}</h2>
              <form onSubmit={saveIncome} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">ประเภทรายรับ *</label>
                    <select required value={incomeForm.incomeType} onChange={e => setIncomeForm({...incomeForm,incomeType:e.target.value})} className={modalFieldInput}>
                      {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">จำนวนเงิน (บาท) *</label>
                    <input required type="number" min="0" step="0.01" value={incomeForm.amount} onChange={e => setIncomeForm({...incomeForm,amount:e.target.value})} className={modalFieldInput} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">วันที่ *</label>
                    <input required type="date" value={incomeForm.date} onChange={e => setIncomeForm({...incomeForm,date:e.target.value})} className={modalFieldInput} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">ฝ่าย</label>
                    <select value={incomeForm.department} onChange={e => setIncomeForm({...incomeForm,department:e.target.value})} className={modalFieldInput}>
                      <option value="">-- ไม่ระบุ --</option>
                      {Object.entries(DEPT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">เลขคดี</label>
                    <input value={incomeForm.caseNumber} onChange={e => setIncomeForm({...incomeForm,caseNumber:e.target.value})} className={modalFieldInput} placeholder="เลขคดี" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">ชื่อลูกค้า</label>
                    <input value={incomeForm.clientName} onChange={e => setIncomeForm({...incomeForm,clientName:e.target.value})} className={modalFieldInput} placeholder="ชื่อลูกค้า" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">หมายเหตุ</label>
                  <textarea rows={2} value={incomeForm.note} onChange={e => setIncomeForm({...incomeForm,note:e.target.value})} className={`${modalFieldInput} resize-none`} />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowModal(null); setEditItem(null) }} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ยกเลิก</button>
                  <button type="submit" disabled={saving} className="px-5 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50">
                    {saving ? 'กำลังบันทึก...' : editItem ? 'บันทึก' : 'เพิ่มรายรับ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPENSE MODAL ────────────────────────────────────────────────── */}
      {showModal === 'expense' && (
        <div className="fixed inset-0 bg-black/40 z-60 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className={`${dashboardDialogPanel} w-full max-w-lg p-6`}>
              <h2 className="font-semibold text-gray-800 text-lg mb-4">{editItem ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่ายคดี'}</h2>
              <form onSubmit={saveExpense} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">ประเภทค่าใช้จ่าย *</label>
                    <select required value={expenseForm.expenseType} onChange={e => setExpenseForm({...expenseForm,expenseType:e.target.value})} className={modalFieldInput}>
                      {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">จำนวนเงิน (บาท) *</label>
                    <input required type="number" min="0" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm,amount:e.target.value})} className={modalFieldInput} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">วันที่ *</label>
                    <input required type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm,date:e.target.value})} className={modalFieldInput} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">พนักงาน *</label>
                    <select required value={expenseForm.employeeId} onChange={e => setExpenseForm({...expenseForm,employeeId:e.target.value})} className={modalFieldInput}>
                      <option value="">-- เลือกพนักงาน --</option>
                      {employees.map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">เลขคดี</label>
                    <input value={expenseForm.caseNumber} onChange={e => setExpenseForm({...expenseForm,caseNumber:e.target.value})} className={modalFieldInput} placeholder="เลขคดี" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">ฝ่าย</label>
                    <select value={expenseForm.department} onChange={e => setExpenseForm({...expenseForm,department:e.target.value})} className={modalFieldInput}>
                      <option value="">-- ไม่ระบุ --</option>
                      {Object.entries(DEPT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">หมายเหตุ</label>
                  <textarea rows={2} value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm,note:e.target.value})} className={`${modalFieldInput} resize-none`} />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowModal(null); setEditItem(null) }} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ยกเลิก</button>
                  <button type="submit" disabled={saving} className="px-5 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-50">
                    {saving ? 'กำลังบันทึก...' : editItem ? 'บันทึก' : 'เพิ่มค่าใช้จ่าย'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
