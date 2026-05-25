'use client'

import { useState } from 'react'
import { BookOpen, Plus, ExternalLink, Tag, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Rule = { id: string; title: string; content: string; fileUrl: string; category: string; version: string; publishedAt: string }

const CATEGORY_LABELS: Record<string, string> = {
  general: 'ทั่วไป', hr: 'HR', safety: 'ความปลอดภัย', conduct: 'จรรยาบรรณ',
}
const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-blue-500/20 text-blue-400',
  hr: 'bg-purple-500/20 text-purple-400',
  safety: 'bg-red-500/20 text-red-400',
  conduct: 'bg-green-500/20 text-green-400',
}

export default function RulesClient({ isManager, rules: init }: { isManager: boolean; rules: Rule[] }) {
  const [rules, setRules] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Rule | null>(null)
  const [form, setForm] = useState({ title: '', content: '', fileUrl: '', category: 'general', version: '' })
  const [submitting, setSubmitting] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.title) { toast.error('กรุณาระบุชื่อ'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('เพิ่มกฎระเบียบแล้ว')
      setShowForm(false)
      setForm({ title: '', content: '', fileUrl: '', category: 'general', version: '' })
      const r2 = await fetch('/api/rules')
      const d2 = await r2.json()
      setRules(d2.rules ?? [])
    } finally {
      setSubmitting(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('ลบกฎระเบียบนี้?')) return
    const res = await fetch(`/api/rules?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRules((r) => r.filter((x) => x.id !== id))
      if (selected?.id === id) setSelected(null)
      toast.success('ลบแล้ว')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">กฎระเบียบบริษัท</h1>
        {isManager && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> เพิ่มกฎระเบียบ
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">เพิ่มกฎระเบียบใหม่</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-sm text-white/50 block mb-1">ชื่อเรื่อง *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1">หมวดหมู่</label>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-white/50 block mb-1">เนื้อหา</label>
            <textarea value={form.content} onChange={(e) => set('content', e.target.value)} rows={5} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" placeholder="พิมพ์เนื้อหากฎระเบียบ..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/50 block mb-1">URL ไฟล์ PDF (ถ้ามี)</label>
              <input value={form.fileUrl} onChange={(e) => set('fileUrl', e.target.value)} placeholder="https://..." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1">เวอร์ชัน</label>
              <input value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="เช่น v1.0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition">ยกเลิก</button>
            <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* List */}
        <div className="md:col-span-1 space-y-2">
          {rules.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`w-full text-left p-3 rounded-xl border transition ${selected?.id === r.id ? 'bg-blue-500/20 border-blue-500/40' : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium line-clamp-2">{r.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${CATEGORY_COLORS[r.category] ?? 'bg-white/10 text-white/40'}`}>
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                    {r.version && <span className="text-white/30 text-xs">{r.version}</span>}
                  </div>
                </div>
                {isManager && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRule(r.id) }}
                    className="text-white/20 hover:text-red-400 transition flex-shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </button>
          ))}
          {rules.length === 0 && (
            <div className="text-center text-white/30 py-8">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">ยังไม่มีกฎระเบียบ</p>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="md:col-span-2">
          {selected ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-white font-bold text-lg">{selected.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[selected.category] ?? 'bg-white/10 text-white/40'}`}>
                      {CATEGORY_LABELS[selected.category] ?? selected.category}
                    </span>
                    {selected.version && <span className="text-white/30 text-sm">{selected.version}</span>}
                    <span className="text-white/30 text-xs">
                      {new Date(selected.publishedAt).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                </div>
                {selected.fileUrl && (
                  <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 text-sm transition">
                    <ExternalLink className="w-3.5 h-3.5" /> ดู PDF
                  </a>
                )}
              </div>
              {selected.content && (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-white/70 text-sm whitespace-pre-wrap leading-relaxed">{selected.content}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[200px] text-white/20">
              <BookOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">เลือกกฎระเบียบเพื่ออ่าน</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
