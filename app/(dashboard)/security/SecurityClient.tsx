'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, Activity, HardDrive, Users, AlertTriangle, CheckCircle, Download, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type DashboardStats = {
  failedLogins24h: number
  criticalEvents7d: number
  activeSessions: number
  lockedAccounts: number
  lastBackupAt: string | null
  totalBackups: number
}

type SecurityEvent = {
  id: string
  eventType: string
  severity: string
  description: string
  ip: string | null
  createdAt: string
  user: { name: string; email: string } | null
}

type BackupRecord = {
  id: string
  filename: string
  sizeBytes: number
  status: string
  createdAt: string
  note: string | null
}

type TwoFactorStatus = {
  enabled: boolean
  channel: string
  enabledAt: string | null
}

type Tab = 'dashboard' | 'events' | 'backups' | '2fa'

const SEVERITY_COLOR: Record<string, string> = {
  INFO:     'text-blue-400 bg-blue-500/10',
  WARNING:  'text-yellow-400 bg-yellow-500/10',
  CRITICAL: 'text-red-400 bg-red-500/10',
}

function fmtBytes(b: number) {
  if (b < 1024)        return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SecurityClient() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [stats, setStats]   = useState<DashboardStats | null>(null)
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [twofa, setTwofa]   = useState<TwoFactorStatus | null>(null)
  const [creating, setCreating] = useState(false)

  const loadStats = useCallback(async () => {
    const r = await fetch('/api/security/dashboard').catch(() => null)
    if (r?.ok) setStats(await r.json())
  }, [])

  const loadEvents = useCallback(async () => {
    const r = await fetch('/api/security/events?take=30').catch(() => null)
    if (r?.ok) { const d = await r.json() as { events: SecurityEvent[] }; setEvents(d.events ?? []) }
  }, [])

  const loadBackups = useCallback(async () => {
    const r = await fetch('/api/backup').catch(() => null)
    if (r?.ok) { const d = await r.json() as { records: BackupRecord[] }; setBackups(d.records ?? []) }
  }, [])

  const load2fa = useCallback(async () => {
    const r = await fetch('/api/security/2fa').catch(() => null)
    if (r?.ok) setTwofa(await r.json())
  }, [])

  useEffect(() => {
    void loadStats()
    void load2fa()
  }, [loadStats, load2fa])

  useEffect(() => {
    if (tab === 'events')  void loadEvents()
    if (tab === 'backups') void loadBackups()
  }, [tab, loadEvents, loadBackups])

  const createBackup = async () => {
    setCreating(true)
    try {
      const r = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!r.ok) { toast.error('สร้าง backup ไม่สำเร็จ'); return }
      toast.success('สร้าง backup สำเร็จ')
      void loadBackups()
      void loadStats()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setCreating(false) }
  }

  const downloadBackup = async (record: BackupRecord) => {
    const r = await fetch(`/api/backup/${record.id}?download=1`)
    if (!r.ok) { toast.error('ดาวน์โหลดไม่สำเร็จ'); return }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = record.filename; a.click()
    URL.revokeObjectURL(url)
  }

  const deleteBackup = async (id: string) => {
    if (!confirm('ลบบันทึก backup นี้?')) return
    const r = await fetch(`/api/backup/${id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('ลบแล้ว'); void loadBackups() }
    else toast.error('ลบไม่สำเร็จ')
  }

  const toggle2fa = async () => {
    if (!twofa) return
    const next = !twofa.enabled
    const r = await fetch('/api/security/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next, channel: 'LINE' }),
    })
    if (r.ok) {
      toast.success(next ? 'เปิดใช้ 2FA แล้ว' : 'ปิด 2FA แล้ว')
      void load2fa()
    } else {
      toast.error('บันทึกไม่สำเร็จ')
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'ภาพรวม',   icon: <Shield size={14} /> },
    { id: 'events',    label: 'เหตุการณ์', icon: <Activity size={14} /> },
    { id: 'backups',   label: 'สำรองข้อมูล', icon: <HardDrive size={14} /> },
    { id: '2fa',       label: '2FA',       icon: <Users size={14} /> },
  ]

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5">
      {/* Header */}
      <div className="glass-card rounded-2xl p-4 border border-blue-500/15 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
          <Shield className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold dark:text-white">ความปลอดภัย &amp; สำรองข้อมูล</h1>
          <p className="text-xs dark:text-slate-400">Phase 15 — Enterprise Security + Backup + Disaster Recovery</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border dark:border-white/10 overflow-hidden">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === t.id ? 'bg-blue-600 text-white' : 'dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          {stats ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Login ล้มเหลว (24h)',    value: stats.failedLogins24h,  icon: <AlertTriangle size={18} className="text-red-400" />,    danger: stats.failedLogins24h > 10 },
                { label: 'เหตุการณ์วิกฤต (7d)',   value: stats.criticalEvents7d, icon: <AlertTriangle size={18} className="text-orange-400" />, danger: stats.criticalEvents7d > 0 },
                { label: 'Session ที่ใช้งาน',      value: stats.activeSessions,   icon: <Users size={18} className="text-blue-400" />,          danger: false },
                { label: 'บัญชีถูกล็อค',           value: stats.lockedAccounts,   icon: <Shield size={18} className="text-yellow-400" />,       danger: stats.lockedAccounts > 0 },
                { label: 'Backup ทั้งหมด',          value: stats.totalBackups,     icon: <HardDrive size={18} className="text-green-400" />,     danger: false },
                { label: 'Backup ล่าสุด',           value: fmtDate(stats.lastBackupAt), icon: <CheckCircle size={18} className="text-green-400" />, danger: false },
              ].map(s => (
                <div
                  key={s.label}
                  className={`glass-card rounded-xl p-4 border ${s.danger ? 'border-red-500/30' : 'dark:border-white/10'}`}
                >
                  <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs dark:text-slate-400">{s.label}</span></div>
                  <p className="text-xl font-bold dark:text-white">{s.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
          )}

          <button
            type="button"
            onClick={() => { void loadStats() }}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw size={12} /> รีเฟรช
          </button>
        </div>
      )}

      {/* Events tab */}
      {tab === 'events' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b dark:border-white/10 dark:text-slate-400">
                  <th className="px-3 py-2 text-left">เวลา</th>
                  <th className="px-3 py-2 text-left">ผู้ใช้</th>
                  <th className="px-3 py-2 text-left">ประเภท</th>
                  <th className="px-3 py-2 text-left">ระดับ</th>
                  <th className="px-3 py-2 text-left">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 dark:text-slate-500">ไม่มีเหตุการณ์</td></tr>
                )}
                {events.map(ev => (
                  <tr key={ev.id} className="border-b dark:border-white/5 dark:hover:bg-white/5">
                    <td className="px-3 py-2 dark:text-slate-400 whitespace-nowrap">{fmtDate(ev.createdAt)}</td>
                    <td className="px-3 py-2 dark:text-slate-300">{ev.user?.name ?? '-'}</td>
                    <td className="px-3 py-2 dark:text-slate-300">{ev.eventType}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_COLOR[ev.severity] ?? 'text-slate-400'}`}>
                        {ev.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 dark:text-slate-400 max-w-xs truncate">{ev.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backups tab */}
      {tab === 'backups' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={createBackup}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
            สร้าง Backup ทันที
          </button>

          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b dark:border-white/10 dark:text-slate-400">
                    <th className="px-3 py-2 text-left">ชื่อไฟล์</th>
                    <th className="px-3 py-2 text-left">ขนาด</th>
                    <th className="px-3 py-2 text-left">วันที่</th>
                    <th className="px-3 py-2 text-left">หมายเหตุ</th>
                    <th className="px-3 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 dark:text-slate-500">ยังไม่มี backup</td></tr>
                  )}
                  {backups.map(b => (
                    <tr key={b.id} className="border-b dark:border-white/5 dark:hover:bg-white/5">
                      <td className="px-3 py-2 dark:text-slate-300 font-mono">{b.filename}</td>
                      <td className="px-3 py-2 dark:text-slate-400">{fmtBytes(b.sizeBytes)}</td>
                      <td className="px-3 py-2 dark:text-slate-400 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                      <td className="px-3 py-2 dark:text-slate-500">{b.note ?? '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void downloadBackup(b)}
                            className="p-1 rounded hover:bg-blue-500/20 text-blue-400"
                            title="ดาวน์โหลด"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteBackup(b.id)}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400"
                            title="ลบ"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2FA tab */}
      {tab === '2fa' && twofa && (
        <div className="glass-card rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold dark:text-white">Two-Factor Authentication (2FA)</p>
              <p className="text-xs dark:text-slate-400 mt-1">
                ยืนยันตัวตนด้วย OTP ผ่าน LINE เมื่อเข้าสู่ระบบ
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${twofa.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                {twofa.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}
              </span>
            </div>
          </div>

          {twofa.enabled && twofa.enabledAt && (
            <p className="text-xs dark:text-slate-500">เปิดใช้ตั้งแต่: {fmtDate(twofa.enabledAt)}</p>
          )}

          <div className="rounded-xl border dark:border-white/10 p-4 space-y-2 text-sm dark:text-slate-300">
            <p className="font-semibold dark:text-white text-xs uppercase tracking-wide">ข้อกำหนด</p>
            <ul className="list-disc list-inside text-xs space-y-1 dark:text-slate-400">
              <li>ต้องผูก LINE OA ก่อนเปิดใช้ 2FA</li>
              <li>รหัส OTP ส่งผ่าน LINE มีอายุ 15 นาที</li>
              <li>แนะนำสำหรับบัญชี CEO, HR, Finance, Lawyer</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => void toggle2fa()}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition ${
              twofa.enabled
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {twofa.enabled ? 'ปิดการใช้งาน 2FA' : 'เปิดใช้งาน 2FA ผ่าน LINE'}
          </button>
        </div>
      )}
    </div>
  )
}
