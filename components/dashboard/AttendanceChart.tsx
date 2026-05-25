'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

type DayData = {
  day: string
  present: number
  late: number
  absent: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3.5 py-2.5 text-xs shadow-xl"
      style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <p className="font-semibold text-white mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-semibold text-white">{p.value} คน</span>
        </div>
      ))}
    </div>
  )
}

export default function AttendanceChart({ data }: { data: DayData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barSize={8} barGap={2} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 6 }} />
        <Bar dataKey="present" name="เข้างาน" fill="#3b82f6" radius={[4,4,0,0]} />
        <Bar dataKey="late"    name="มาสาย"  fill="#f59e0b" radius={[4,4,0,0]} />
        <Bar dataKey="absent"  name="ขาด/ลา" fill="#ef4444" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
