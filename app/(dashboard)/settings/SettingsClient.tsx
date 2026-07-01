'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Save, MapPin, Clock, MessageCircle, Building2, Loader2, Send, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { KM_COMPANY } from '@/lib/company-defaults'
import LineHrSendPanel from '@/components/line/LineHrSendPanel'

type Settings = {
  companyName: string
  companyNameEn: string
  workStartTime: string
  workEndTime: string
  lateGraceMin: number
  sickDaysYear: number
  vacationDaysYear: number
  personalDaysYear: number
  lineChannelId: string
  lineChannelSecret: string
  lineAccessToken: string
  lineNotifyToken: string
  geofenceLat: number | null
  geofenceLng: number | null
  geofenceRadius: number
  lateDeductRate: number
  absentDeductRate: number
  imageRetentionDays: number
}

export default function SettingsClient({ settings }: { settings: Settings | null }) {
  const [form, setForm] = useState<Settings>({
    companyName: settings?.companyName ?? KM_COMPANY.companyName,
    companyNameEn: settings?.companyNameEn ?? KM_COMPANY.companyNameEn,
    workStartTime: settings?.workStartTime ?? '08:30',
    workEndTime: settings?.workEndTime ?? '17:30',
    lateGraceMin: settings?.lateGraceMin ?? 15,
    sickDaysYear: settings?.sickDaysYear ?? 30,
    vacationDaysYear: settings?.vacationDaysYear ?? 6,
    personalDaysYear: settings?.personalDaysYear ?? 3,
    lineChannelId: settings?.lineChannelId ?? '',
    lineChannelSecret: settings?.lineChannelSecret ?? '',
    lineAccessToken: settings?.lineAccessToken ?? '',
    lineNotifyToken: settings?.lineNotifyToken ?? '',
    geofenceLat: settings?.geofenceLat ?? null,
    geofenceLng: settings?.geofenceLng ?? null,
    geofenceRadius: settings?.geofenceRadius ?? 200,
    lateDeductRate: settings?.lateDeductRate ?? 0,
    absentDeductRate: settings?.absentDeductRate ?? 0,
    imageRetentionDays: settings?.imageRetentionDays ?? 90,
  })
  const [saving, setSaving] = useState(false)
  const [lineTab, setLineTab] = useState<'config' | 'send'>('send')

  const set = (key: keyof Settings, value: any) => setForm((f) => ({ ...f, [key]: value }))

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      set('geofenceLat', pos.coords.latitude)
      set('geofenceLng', pos.coords.longitude)
      toast.success('ได้ตำแหน่งบริษัทแล้ว')
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (ok) toast.success('บันทึกการตั้งค่าแล้ว')
      else toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
    } catch (err) {
      console.error('[settings]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const Input = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
    <div className="min-w-0">
      <label className="block text-sm text-slate-500 dark:text-white/50 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 max-w-full box-border bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:border-blue-500"
      />
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ตั้งค่าบริษัท</h1>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </button>
      </div>

      {/* Company Info */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" /> ข้อมูลบริษัท
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="ชื่อบริษัท (ไทย)" value={form.companyName} onChange={(v: string) => set('companyName', v)} />
          <Input label="ชื่อบริษัท (อังกฤษ)" value={form.companyNameEn} onChange={(v: string) => set('companyNameEn', v)} />
        </div>
      </section>

      {/* Work Hours */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" /> เวลาทำงาน
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="min-w-0">
            <Input label="เวลาเข้างาน" value={form.workStartTime} onChange={(v: string) => set('workStartTime', v)} type="time" />
          </div>
          <div className="min-w-0">
            <Input label="เวลาออกงาน" value={form.workEndTime} onChange={(v: string) => set('workEndTime', v)} type="time" />
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <Input label="ผ่อนผันสาย (นาที)" value={form.lateGraceMin} onChange={(v: number) => set('lateGraceMin', v)} type="number" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="วันลาป่วย/ปี" value={form.sickDaysYear} onChange={(v: number) => set('sickDaysYear', v)} type="number" />
          <Input label="วันพักร้อน/ปี" value={form.vacationDaysYear} onChange={(v: number) => set('vacationDaysYear', v)} type="number" />
          <Input label="วันลากิจ/ปี" value={form.personalDaysYear} onChange={(v: number) => set('personalDaysYear', v)} type="number" />
        </div>
      </section>

      {/* Payroll Deduction */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white">การหักเงิน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="หักสาย (บาท/นาที)" value={form.lateDeductRate} onChange={(v: number) => set('lateDeductRate', v)} type="number" placeholder="0 = ไม่หัก" />
          <Input label="หักขาดงาน (บาท/วัน เพิ่มเติม)" value={form.absentDeductRate} onChange={(v: number) => set('absentDeductRate', v)} type="number" placeholder="0 = คิดตามฐาน" />
        </div>
        <p className="text-xs text-slate-400 dark:text-white/30">* ขาดงานจะหักตามอัตราเงินเดือนรายวันเสมอ ค่านี้เป็นเพิ่มเติม</p>
      </section>

      {/* Cloudinary retention */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-cyan-400" /> เก็บรูป Cloudinary
        </h2>
        <p className="text-xs text-slate-400 dark:text-white/40">
          ลบรูปสแกนใบหน้า / โปรไฟล์ที่เก่ากว่ากำหนดอัตโนมัติ (cron) — ใช้ signed URL เท่านั้น
        </p>
        <div className="flex flex-wrap gap-2">
          {[30, 90, 180].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => set('imageRetentionDays', days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                form.imageRetentionDays === days
                  ? 'bg-cyan-600 border-cyan-500 text-white'
                  : 'border-white/10 text-slate-500 dark:text-white/60 hover:bg-white/5'
              }`}
            >
              {days} วัน
            </button>
          ))}
        </div>
      </section>

      {/* Geofence */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" /> Geofence เช็คอิน
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Latitude" value={form.geofenceLat} onChange={(v: number) => set('geofenceLat', v)} type="number" placeholder="13.xxxx" />
          <Input label="Longitude" value={form.geofenceLng} onChange={(v: number) => set('geofenceLng', v)} type="number" placeholder="100.xxxx" />
          <Input label="รัศมี (เมตร)" value={form.geofenceRadius} onChange={(v: number) => set('geofenceRadius', v)} type="number" />
        </div>
        <button
          onClick={getLocation}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-slate-500 dark:text-white/60 hover:bg-white/5 text-sm transition"
        >
          <MapPin className="w-4 h-4" /> ใช้ตำแหน่งปัจจุบันเป็นที่ตั้งบริษัท
        </button>
      </section>

      {/* LINE */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-400" /> LINE Integration
          </h2>
          <Link
            href="/line-oa"
            className="text-xs text-blue-400 hover:underline"
          >
            เปิดหน้า LINE OA →
          </Link>
        </div>

        <div className="flex rounded-xl border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setLineTab('send')}
            className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-semibold transition ${
              lineTab === 'send' ? 'bg-[#06C755] text-white' : 'text-slate-500 dark:text-white/50 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            ส่งเข้า LINE
          </button>
          <button
            type="button"
            onClick={() => setLineTab('config')}
            className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-semibold transition ${
              lineTab === 'config' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-white/50 hover:text-white'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            ตั้งค่า API
          </button>
        </div>

        {lineTab === 'send' ? (
          <LineHrSendPanel compact />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              <Input label="LINE Channel Access Token (Messaging API)" value={form.lineAccessToken} onChange={(v: string) => set('lineAccessToken', v)} type="password" placeholder="ดูได้ที่ LINE Developers Console" />
              <Input label="LINE Notify Token (สำหรับ broadcast)" value={form.lineNotifyToken} onChange={(v: string) => set('lineNotifyToken', v)} type="password" />
              <Input label="LINE Channel ID" value={form.lineChannelId} onChange={(v: string) => set('lineChannelId', v)} />
              <Input label="LINE Channel Secret" value={form.lineChannelSecret} onChange={(v: string) => set('lineChannelSecret', v)} type="password" />
            </div>
            <p className="text-xs text-slate-400 dark:text-white/30">
              * Production ใช้ env บน Vercel (LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN) —
              พนักงานต้องผูก LINE ที่โปรไฟล์ก่อนจึงส่งถึงได้
            </p>
          </>
        )}
      </section>
    </div>
  )
}
