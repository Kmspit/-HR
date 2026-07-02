'use client'

import dynamic from 'next/dynamic'

const AttendanceChart = dynamic(() => import('./AttendanceChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
    </div>
  ),
})

export default function AttendanceChartWrapper({ data }: {
  data: { day: string; present: number; late: number; absent: number }[]
}) {
  return <AttendanceChart data={data} />
}
