'use client'

import { Building2, Briefcase, Calendar, Clock, History, Layers } from 'lucide-react'
import type { ProfileHistoryItem } from '@/lib/profile-history'

export type ProfileRecordInfo = {
  registeredAt: string
  position: string
  branchName: string
  divisionName: string
  departmentName: string
  sectionName: string
  lastUpdatedAt: string
}

type Props = {
  record: ProfileRecordInfo
  history: ProfileHistoryItem[]
}

function formatThaiDateTime(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatThaiDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function InfoCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white p-3.5 min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="dark:text-slate-500 light:text-slate-400">{icon}</span>
        <dt className="text-[11px] font-medium uppercase tracking-wide dark:text-slate-500 light:text-slate-500">
          {label}
        </dt>
      </div>
      <dd className="text-sm font-medium dark:text-slate-100 light:text-slate-800 break-words leading-snug">
        {value || '—'}
      </dd>
    </div>
  )
}

export default function ProfileDataHistory({ record, history }: Props) {
  return (
    <section className="glass-card rounded-2xl p-5 md:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 dark:text-white light:text-slate-900">
          <History className="w-4 h-4 text-violet-400 light:text-violet-600" />
          ประวัติข้อมูล
        </h3>
        <p className="text-xs mt-1 dark:text-slate-500 light:text-slate-500">
          ข้อมูลสมัครและโครงสร้างองค์กร — อ่านอย่างเดียว
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <InfoCell
          label="วันที่สมัคร"
          value={formatThaiDate(record.registeredAt)}
          icon={<Calendar className="w-3.5 h-3.5" />}
        />
        <InfoCell
          label="ตำแหน่ง"
          value={record.position}
          icon={<Briefcase className="w-3.5 h-3.5" />}
        />
        <InfoCell
          label="สาขา"
          value={record.branchName}
          icon={<Building2 className="w-3.5 h-3.5" />}
        />
        <InfoCell
          label="ฝ่าย"
          value={record.divisionName}
          icon={<Layers className="w-3.5 h-3.5" />}
        />
        <InfoCell
          label="แผนก"
          value={record.departmentName}
          icon={<Layers className="w-3.5 h-3.5" />}
        />
        <InfoCell
          label="ส่วนงาน"
          value={record.sectionName}
          icon={<Layers className="w-3.5 h-3.5" />}
        />
      </dl>

      <div className="pt-2 border-t dark:border-white/10 light:border-slate-200">
        <h4 className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 dark:text-slate-400 light:text-slate-600">
          <Clock className="w-3.5 h-3.5" />
          ประวัติการแก้ไขข้อมูล
        </h4>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed dark:border-white/10 light:border-slate-200 px-4 py-6 text-center">
            <p className="text-sm dark:text-slate-400 light:text-slate-600">
              ยังไม่มีบันทึกการแก้ไขในระบบ
            </p>
            {record.lastUpdatedAt ? (
              <p className="text-xs mt-2 dark:text-slate-500 light:text-slate-500">
                อัปเดตข้อมูลล่าสุด: {formatThaiDateTime(record.lastUpdatedAt)}
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {history.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border dark:border-white/8 light:border-slate-200 dark:bg-white/[0.02] light:bg-slate-50/80 p-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <time
                    className="text-xs font-medium dark:text-slate-300 light:text-slate-700"
                    dateTime={item.at}
                  >
                    {formatThaiDateTime(item.at)}
                  </time>
                  <span className="text-[11px] dark:text-slate-500 light:text-slate-500">
                    โดย {item.actorName}
                  </span>
                </div>
                <ul className="space-y-1">
                  {item.changes.map((line, i) => (
                    <li
                      key={i}
                      className="text-xs leading-relaxed dark:text-slate-400 light:text-slate-600 pl-3 border-l-2 dark:border-blue-500/40 light:border-blue-400"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
