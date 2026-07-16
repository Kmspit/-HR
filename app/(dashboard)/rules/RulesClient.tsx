'use client'

import { useRef, useState } from 'react'
import {
  BookOpen, Plus, ExternalLink, Tag, Loader2, Trash2, Upload,
  FileText, X, Download, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Rule = {
  id: string
  title: string
  content: string
  fileUrl: string
  category: string
  version: string
  publishedAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'ทั่วไป', hr: 'HR', safety: 'ความปลอดภัย', conduct: 'จรรยาบรรณ',
}
const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-green-500/20 text-green-400',
  hr: 'bg-purple-500/20 text-purple-400',
  safety: 'bg-red-500/20 text-red-400',
  conduct: 'bg-green-500/20 text-green-400',
}

const FILE_EXT_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', doc: '📝', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', webp: '🖼️',
}

function fileExt(url: string): string {
  return url.split('.').pop()?.toLowerCase() ?? ''
}

function isPdf(url: string): boolean {
  return fileExt(url) === 'pdf'
}

function isImage(url: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp'].includes(fileExt(url))
}

type FormState = {
  title: string; content: string; fileUrl: string; category: string; version: string
}
const EMPTY_FORM: FormState = { title: '', content: '', fileUrl: '', category: 'general', version: '' }

export default function RulesClient({ isManager, rules: init }: { isManager: boolean; rules: Rule[] }) {
  const [rules, setRules] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Rule | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/rules/upload', { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'อัปโหลดไม่สำเร็จ'); return }
      set('fileUrl', data.fileUrl)
      toast.success('อัปโหลดไฟล์แล้ว')
    } catch {
      toast.error('อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!form.title) { toast.error('กรุณาระบุชื่อ'); return }
    setSubmitting(true)
    try {
      const { ok, data, status } = await apiJson('/api/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success('เพิ่มกฎระเบียบแล้ว')
      setShowForm(false)
      setForm(EMPTY_FORM)
      const { data: d2 } = await apiJson<{ rules?: Rule[] }>('/api/rules')
      setRules(d2.rules ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('ลบกฎระเบียบนี้?')) return
    const { ok } = await apiJson(`/api/rules?id=${id}`, { method: 'DELETE' })
    if (ok) {
      setRules((r) => r.filter((x) => x.id !== id))
      if (selected?.id === id) setSelected(null)
      toast.success('ลบแล้ว')
    }
  }

  const downloadFile = async (url: string, name: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold dark:text-white light:text-slate-800">กฎระเบียบบริษัท</h1>
        {isManager && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> เพิ่มกฎระเบียบ
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && isManager && (
        <div className="dark:bg-white/5 light:bg-slate-50 border dark:border-white/10 light:border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold dark:text-white light:text-slate-800">เพิ่มกฎระเบียบใหม่</h3>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} aria-label="ยกเลิก"
              className="p-1.5 rounded-lg dark:text-slate-400 light:text-slate-500 dark:hover:text-white light:hover:text-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="field-1" className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">ชื่อเรื่อง *</label>
              <input id="field-1" value={form.title} onChange={(e) => set('title', e.target.value)}
                className="w-full dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-xl px-3 py-2.5 dark:text-white light:text-slate-800 text-sm focus:outline-none focus:border-green-500" />
            </div>
            <div>
              <label htmlFor="field-2" className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">หมวดหมู่</label>
              <select id="field-2" value={form.category} onChange={(e) => set('category', e.target.value)}
                className="w-full dark:bg-slate-800 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-xl px-3 py-2.5 dark:text-white light:text-slate-800 text-sm focus:outline-none focus:border-green-500">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="field-3" className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">เนื้อหา</label>
            <textarea id="field-3" value={form.content} onChange={(e) => set('content', e.target.value)}
              rows={4} placeholder="พิมพ์เนื้อหากฎระเบียบ..."
              className="w-full dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-xl px-3 py-2.5 dark:text-white light:text-slate-800 text-sm focus:outline-none focus:border-green-500 resize-none" />
          </div>

          {/* File upload */}
          <div>
            <span className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">
              ไฟล์แนบ <span className="opacity-60">(PDF, DOCX, Image — สูงสุด 20 MB)</span>
            </span>
            {form.fileUrl ? (
              <div className="flex items-center gap-2 p-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white">
                <span className="text-base">{FILE_EXT_ICON[fileExt(form.fileUrl)] ?? '📎'}</span>
                <span className="flex-1 text-xs dark:text-slate-300 light:text-slate-600 truncate">{form.fileUrl.split('/').pop()}</span>
                <button onClick={() => set('fileUrl', '')} aria-label="ลบไฟล์แนบ"
                  className="text-slate-500 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed dark:border-white/10 light:border-slate-200 rounded-xl px-4 py-6 text-center cursor-pointer
                  hover:dark:border-green-500/40 hover:light:border-green-400 transition-colors group"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-green-400" />
                ) : (
                  <>
                    <Upload className="w-5 h-5 mx-auto mb-1 dark:text-slate-500 light:text-slate-400 group-hover:text-green-400 transition-colors" />
                    <p className="text-xs dark:text-slate-400 light:text-slate-500">คลิกเพื่ออัปโหลดไฟล์</p>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
            />
          </div>

          {/* URL fallback */}
          {!form.fileUrl && (
            <div>
              <label htmlFor="field-4" className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">
                หรือระบุ URL ไฟล์
              </label>
              <input id="field-4" value={form.fileUrl} onChange={(e) => set('fileUrl', e.target.value)}
                placeholder="https://..."
                className="w-full dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-xl px-3 py-2.5 dark:text-white light:text-slate-800 text-sm focus:outline-none focus:border-green-500" />
            </div>
          )}

          <div>
            <label htmlFor="field-5" className="text-xs dark:text-white/50 light:text-slate-500 block mb-1">เวอร์ชัน</label>
            <input id="field-5" value={form.version} onChange={(e) => set('version', e.target.value)}
              placeholder="เช่น v1.0, v2024.05"
              className="w-full dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-xl px-3 py-2.5 dark:text-white light:text-slate-800 text-sm focus:outline-none focus:border-green-500" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="flex-1 py-2.5 rounded-xl border dark:border-white/10 light:border-slate-200 dark:text-white/50 light:text-slate-500 text-sm hover:dark:bg-white/5 hover:light:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button onClick={submit} disabled={submitting || uploading}
              className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 dark:text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* List */}
        <div className="md:col-span-1 space-y-2">
          {rules.length === 0 && (
            <div className="text-center dark:text-white/30 light:text-slate-400 py-8">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">ยังไม่มีกฎระเบียบ</p>
            </div>
          )}
          {rules.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${selected?.id === r.id
                ? 'dark:bg-green-500/20 dark:border-green-500/40 light:bg-green-50 light:border-green-300'
                : 'dark:bg-white/5 dark:border-white/10 light:bg-white light:border-slate-200 dark:hover:bg-white/[0.07] light:hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    {r.fileUrl && (
                      <span className="text-sm flex-shrink-0 mt-0.5">
                        {FILE_EXT_ICON[fileExt(r.fileUrl)] ?? '📎'}
                      </span>
                    )}
                    <p className="dark:text-white light:text-slate-800 text-sm font-medium line-clamp-2">{r.title}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[12px] ${CATEGORY_COLORS[r.category] ?? 'bg-white/10 dark:text-white/40 light:text-slate-500'}`}>
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                    {r.version && <span className="dark:text-white/30 light:text-slate-400 text-[12px]">{r.version}</span>}
                  </div>
                </div>
                {isManager && (
                  <button onClick={(e) => { e.stopPropagation(); deleteRule(r.id) }} aria-label="ลบ"
                    className="dark:text-white/20 light:text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="md:col-span-2">
          {selected ? (
            <div className="dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-2xl overflow-hidden">
              {/* Detail header */}
              <div className="px-5 py-4 border-b dark:border-white/10 light:border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="dark:text-white light:text-slate-800 font-bold text-base">{selected.title}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[selected.category] ?? 'bg-white/10 dark:text-white/40 light:text-slate-500'}`}>
                        <Tag className="w-2.5 h-2.5 inline mr-0.5" />
                        {CATEGORY_LABELS[selected.category] ?? selected.category}
                      </span>
                      {selected.version && (
                        <span className="dark:text-white/40 light:text-slate-500 text-xs font-mono">{selected.version}</span>
                      )}
                      <span className="dark:text-white/30 light:text-slate-400 text-xs">
                        {new Date(selected.publishedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* File preview */}
              {selected.fileUrl && (
                <div className="border-b dark:border-white/10 light:border-slate-100">
                  {isPdf(selected.fileUrl) ? (
                    <div>
                      <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
                        <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-xs dark:text-slate-400 light:text-slate-500 flex-1 truncate">{selected.fileUrl.split('/').pop()}</span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setPdfPreview(pdfPreview === selected.id ? null : selected.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border dark:border-white/10 light:border-slate-200 text-xs dark:text-slate-300 light:text-slate-600 dark:hover:bg-white/5 light:hover:bg-slate-50 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            {pdfPreview === selected.id ? 'ซ่อน' : 'ดูตัวอย่าง'}
                          </button>
                          <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border dark:border-white/10 light:border-slate-200 text-xs dark:text-slate-300 light:text-slate-600 dark:hover:bg-white/5 light:hover:bg-slate-50 transition-colors">
                            <ExternalLink className="w-3 h-3" />
                            เปิดใหม่
                          </a>
                          <button
                            onClick={() => downloadFile(selected.fileUrl, `${selected.title}.pdf`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-xs text-white font-semibold transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            ดาวน์โหลด
                          </button>
                        </div>
                      </div>
                      {pdfPreview === selected.id && (
                        <div className="border-t dark:border-white/10 light:border-slate-100">
                          <iframe
                            src={selected.fileUrl}
                            title={selected.title}
                            className="w-full border-0 bg-white"
                            style={{ height: 'clamp(300px, 50vh, 600px)' }}
                          />
                        </div>
                      )}
                    </div>
                  ) : isImage(selected.fileUrl) ? (
                    <div className="p-4 space-y-2">
                      <img
                        src={selected.fileUrl}
                        alt={selected.title}
                        className="max-w-full rounded-xl border dark:border-white/10 light:border-slate-100 object-contain max-h-[400px]"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadFile(selected.fileUrl, selected.title)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-xs text-white font-semibold transition-colors"
                        >
                          <Download className="w-3 h-3" /> ดาวน์โหลด
                        </button>
                        <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border dark:border-white/10 light:border-slate-200 text-xs dark:text-slate-300 light:text-slate-600 dark:hover:bg-white/5 light:hover:bg-slate-50 transition-colors">
                          <ExternalLink className="w-3 h-3" /> เปิดใหม่
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-3 flex items-center gap-2">
                      <span className="text-base">{FILE_EXT_ICON[fileExt(selected.fileUrl)] ?? '📎'}</span>
                      <span className="text-xs dark:text-slate-400 light:text-slate-500 flex-1 truncate">{selected.fileUrl.split('/').pop()}</span>
                      <button
                        onClick={() => downloadFile(selected.fileUrl, selected.title)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-xs text-white font-semibold transition-colors"
                      >
                        <Download className="w-3 h-3" /> ดาวน์โหลด
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Content */}
              {selected.content && (
                <div className="px-5 py-4">
                  <p className="dark:text-white/70 light:text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                    {selected.content}
                  </p>
                </div>
              )}

              {!selected.fileUrl && !selected.content && (
                <div className="px-5 py-8 text-center dark:text-white/20 light:text-slate-300 text-sm">ไม่มีเนื้อหา</div>
              )}
            </div>
          ) : (
            <div className="dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[200px] dark:text-white/20 light:text-slate-300">
              <BookOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">เลือกกฎระเบียบเพื่ออ่าน</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
