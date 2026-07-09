'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

const PIE_COLORS = ['#22c55e','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export function MonthlyFinanceBarChart({ monthly }: {
  monthly: { month: number; income: number; expense: number; profit: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={monthly.map(m => ({ ...m, name: MONTH_TH[m.month-1] }))}>
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
  )
}

export function IncomeTypePieChart({ incomeByType }: { incomeByType: Record<string, number> }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={Object.entries(incomeByType).map(([k,v]) => ({ name: k, value: v }))}
          cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}
          labelLine={false}>
          {Object.keys(incomeByType).map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: unknown) => [`฿${fmt(Number(v ?? 0))}`]} />
      </PieChart>
    </ResponsiveContainer>
  )
}
