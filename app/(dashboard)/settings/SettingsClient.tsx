'use client'

import { useState } from 'react'
import { Save, MapPin, Clock, MessageCircle, Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { KM_COMPANY } from '@/lib/company-defaults'

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
  })
  const [saving, setSaving] = useState(false)

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
      <label className="block text-sm text-white/50 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 max-w-full box-border bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500"
      />
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ตั้งค่าบริษัท</h1>
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
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" /> ข้อมูลบริษัท
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="ชื่อบริษัท (ไทย)" value={form.companyName} onChange={(v: string) => set('companyName', v)} />
          <Input label="ชื่อบริษัท (อังกฤษ)" value={form.companyNameEn} onChange={(v: string) => set('companyNameEn', v)} />
        </div>
      </section>

      {/* Work Hours */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
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
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white">การหักเงิน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="หักสาย (บาท/นาที)" value={form.lateDeductRate} onChange={(v: number) => set('lateDeductRate', v)} type="number" placeholder="0 = ไม่หัก" />
          <Input label="หักขาดงาน (บาท/วัน เพิ่มเติม)" value={form.absentDeductRate} onChange={(v: number) => set('absentDeductRate', v)} type="number" placeholder="0 = คิดตามฐาน" />
        </div>
        <p className="text-xs text-white/30">* ขาดงานจะหักตามอัตราเงินเดือนรายวันเสมอ ค่านี้เป็นเพิ่มเติม</p>
      </section>

      {/* Geofence */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" /> Geofence เช็คอิน
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Latitude" value={form.geofenceLat} onChange={(v: number) => set('geofenceLat', v)} type="number" placeholder="13.xxxx" />
          <Input label="Longitude" value={form.geofenceLng} onChange={(v: number) => set('geofenceLng', v)} type="number" placeholder="100.xxxx" />
          <Input label="รัศมี (เมตร)" value={form.geofenceRadius} onChange={(v: number) => set('geofenceRadius', v)} type="number" />
        </div>
        <button
          onClick={getLocation}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm transition"
        >
          <MapPin className="w-4 h-4" /> ใช้ตำแหน่งปัจจุบันเป็นที่ตั้งบริษัท
        </button>
      </section>

      {/* LINE */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-400" /> LINE Integration
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <Input label="LINE Channel Access Token (Messaging API)" value={form.lineAccessToken} onChange={(v: string) => set('lineAccessToken', v)} type="password" placeholder="ดูได้ที่ LINE Developers Console" />
          <Input label="LINE Notify Token (สำหรับ broadcast)" value={form.lineNotifyToken} onChange={(v: string) => set('lineNotifyToken', v)} type="password" />
          <Input label="LINE Channel ID" value={form.lineChannelId} onChange={(v: string) => set('lineChannelId', v)} />
          <Input label="LINE Channel Secret" value={form.lineChannelSecret} onChange={(v: string) => set('lineChannelSecret', v)} type="password" />
        </div>
        <p className="text-xs text-white/30">* ต้องตั้งค่า LINE ID ของพนักงานแต่ละคนด้วยถึงจะส่ง Messaging API ถึงคนนั้นได้</p>
      </section>
    </div>
  )
}
