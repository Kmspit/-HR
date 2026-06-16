'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Building2, Plus, Pencil, Trash2, Loader2, Star, MapPin, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

const MapPicker = dynamic(() => import('@/components/branches/MapPicker'), {
  ssr: false,
  loading: () => <div className="h-64 rounded-xl bg-white/5 animate-pulse" />,
})

type Branch = {
  id: string
  code: string
  name: string
  nameEn: string
  address: string
  phone: string
  isActive: boolean
  isDefault: boolean
  lat: number | null
  lng: number | null
  radiusMeters: number
  googleMapPlaceId: string | null
  userCount: number
}

type Props = { initial: Branch[] }

const emptyForm = {
  code: '',
  name: '',
  nameEn: '',
  address: '',
  phone: '',
  isActive: true,
  isDefault: false,
  lat: '',
  lng: '',
  radiusMeters: '100',
  googleMapPlaceId: '',
}

export default function BranchesClient({ initial }: Props) {
  const [list, setList] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    const { ok, data } = await apiJson<{ branches?: Branch[] }>('/api/branches')
    if (ok && data.branches) setList(data.branches)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (b: Branch) => {
    setEditingId(b.id)
    setForm({
      code: b.code,
      name: b.name,
      nameEn: b.nameEn,
      address: b.address,
      phone: b.phone,
      isActive: b.isActive,
      isDefault: b.isDefault,
      lat: b.lat != null ? String(b.lat) : '',
      lng: b.lng != null ? String(b.lng) : '',
      radiusMeters: String(b.radiusMeters),
      googleMapPlaceId: b.googleMapPlaceId ?? '',
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('กรุณาระบุรหัสและชื่อสาขา')
      return
    }
    setSaving(true)
    try {
      const latNum = parseFloat(form.lat)
      const lngNum = parseFloat(form.lng)
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        isActive: form.isActive,
        isDefault: form.isDefault,
        lat: !isNaN(latNum) && form.lat.trim() !== '' ? latNum : null,
        lng: !isNaN(lngNum) && form.lng.trim() !== '' ? lngNum : null,
        radiusMeters: parseFloat(form.radiusMeters) || 100,
        googleMapPlaceId: form.googleMapPlaceId.trim() || null,
      }
      const { ok, data, status } = editingId
        ? await apiJson('/api/branches/' + editingId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await apiJson('/api/branches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
        return
      }
      toast.success(editingId ? 'อัปเดตสาขาแล้ว' : 'เพิ่มสาขาแล้ว')
      setShowForm(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (b: Branch) => {
    if (!confirm(`ลบสาขา "${b.name}" ?`)) return
    const { ok, data, status } = await apiJson(`/api/branches/${b.id}`, { method: 'DELETE' })
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'ลบไม่สำเร็จ', status))
      return
    }
    toast.success('ลบสาขาแล้ว')
    await refresh()
  }

  const parsedLat = form.lat.trim() !== '' ? parseFloat(form.lat) : null
  const parsedLng = form.lng.trim() !== '' ? parseFloat(form.lng) : null
  const parsedRadius = parseFloat(form.radiusMeters) || 100
  const hasCoords = parsedLat != null && !isNaN(parsedLat) && parsedLng != null && !isNaN(parsedLng)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> เพิ่มสาขา
        </button>
      </div>

      {showForm && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            {editingId ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">รหัสสาขา *</label>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
                placeholder="เช่น NMA"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">ชื่อสาขา (ไทย) *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
                placeholder="สาขานครราชสีมา"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">ชื่อ (อังกฤษ)</label>
              <input
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">เบอร์โทร</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1">ที่อยู่</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm resize-none"
            />
          </div>

          {/* Geofence Map Picker */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                ตำแหน่งสาขา &amp; Geofence
              </p>
              {hasCoords && (
                <a
                  href={`https://maps.google.com/?q=${parsedLat},${parsedLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-3 h-3" />
                  เปิดใน Google Maps
                </a>
              )}
            </div>

            <p className="text-[10px] text-slate-500">
              คลิกบนแผนที่เพื่อปักหมุดตำแหน่งสาขา — วงกลมสีน้ำเงินคือรัศมี geofence ที่พนักงานต้องอยู่ภายใน
            </p>

            <MapPicker
              key={editingId ?? 'new'}
              lat={hasCoords ? parsedLat : null}
              lng={hasCoords ? parsedLng : null}
              radiusMeters={parsedRadius}
              onPick={(lat, lng) =>
                setForm((f) => ({
                  ...f,
                  lat: lat.toFixed(6),
                  lng: lng.toFixed(6),
                }))
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs"
                  placeholder="13.851100"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs"
                  placeholder="100.659600"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">รัศมี (เมตร)</label>
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={form.radiusMeters}
                  onChange={(e) => setForm((f) => ({ ...f, radiusMeters: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs"
                  placeholder="100"
                />
              </div>
            </div>

            {!hasCoords && (
              <p className="text-[10px] text-amber-400/70">
                ยังไม่มีพิกัด — คลิกบนแผนที่เพื่อตั้งค่า หรือกรอก Latitude/Longitude ด้วยตนเอง
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="accent-blue-500"
              />
              เปิดใช้งาน
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="accent-blue-500"
              />
              สาขาหลัก (ค่าเริ่มต้น)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="p-3">รหัส</th>
              <th className="p-3">ชื่อสาขา</th>
              <th className="p-3 text-center">พนักงาน</th>
              <th className="p-3 text-center">Geofence</th>
              <th className="p-3 text-center">สถานะ</th>
              <th className="p-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className="border-b border-white/5 table-row-hover">
                <td className="p-3 font-mono text-blue-300">{b.code}</td>
                <td className="p-3 text-white">
                  {b.name}
                  {b.isDefault && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                      <Star className="w-3 h-3" /> หลัก
                    </span>
                  )}
                </td>
                <td className="p-3 text-center text-slate-300">{b.userCount}</td>
                <td className="p-3 text-center">
                  {b.lat != null && b.lng != null ? (
                    <a
                      href={`https://maps.google.com/?q=${b.lat},${b.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-col items-center gap-0.5 text-[10px] text-green-400 font-mono hover:text-green-300"
                    >
                      <span>{b.lat.toFixed(4)}, {b.lng.toFixed(4)}</span>
                      <span className="text-slate-500">{b.radiusMeters}m</span>
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-600">ไม่ตั้งค่า</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      b.isActive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {b.isActive ? 'เปิด' : 'ปิด'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                      aria-label="แก้ไข"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(b)}
                      disabled={b.isDefault}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                      aria-label="ลบ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {list.length === 0 && (
          <p className="p-8 text-center text-slate-500">ยังไม่มีสาขาในระบบ</p>
        )}
      </div>
    </div>
  )
}
