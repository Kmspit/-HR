'use client'

import { useState, useEffect, useCallback } from 'react'
import { modalFieldInput } from '@/lib/theme-classes'
import PortalModal from '@/components/ui/PortalModal'

type Article = {
  id: string
  title: string
  slug: string
  content: string
  category: string
  department: string | null
  tags: string | null
  status: string
  viewCount: number
  createdBy: { name: string }
  approvedBy: { name: string } | null
  createdAt: string
  updatedAt: string
}

type SearchResult = {
  articles: { id: string; title: string; category: string; department: string | null; slug: string }[]
  sops:     { id: string; sopCode: string; title: string; department: string }[]
  modules:  { id: string; title: string; contentType: string; department: string | null }[]
}

const CATEGORIES = [
  { value: 'ALL',      label: 'ทั้งหมด' },
  { value: 'POLICY',   label: 'นโยบาย' },
  { value: 'FAQ',      label: 'คำถามพบบ่อย' },
  { value: 'GUIDELINE',label: 'แนวปฏิบัติ' },
  { value: 'PROCESS',  label: 'ขั้นตอน' },
  { value: 'HR',       label: 'บุคคล' },
  { value: 'IT',       label: 'ไอที' },
  { value: 'LEGAL',    label: 'กฎหมาย' },
  { value: 'GENERAL',  label: 'ทั่วไป' },
]

const CATEGORY_ICONS: Record<string, string> = {
  POLICY:   '📋', FAQ: '❓', GUIDELINE: '📌', PROCESS: '🔄',
  HR: '👥', IT: '💻', LEGAL: '⚖️', GENERAL: '📖',
}

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeClient({
  userId, userRole, userName,
}: { userId: string; userRole: string; userName: string }) {
  const [articles, setArticles]   = useState<Article[]>([])
  const [selected, setSelected]   = useState<Article | null>(null)
  const [category, setCategory]   = useState('ALL')
  const [searchQ, setSearchQ]     = useState('')
  const [searchRes, setSearchRes] = useState<SearchResult | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showCreate, setCreate]   = useState(false)
  const [editing, setEditing]     = useState(false)

  // Form state
  const [form, setForm] = useState({
    title: '', content: '', category: 'GENERAL',
    department: '', tags: '', status: 'DRAFT',
  })
  const [saving, setSaving] = useState(false)
  const isEditor = EDITOR_ROLES.includes(userRole)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'ALL' })
    if (category !== 'ALL') params.set('category', category)
    const r = await fetch(`/api/knowledge?${params}`)
    if (r.ok) {
      const data = await r.json()
      setArticles(data.items ?? [])
    }
    setLoading(false)
  }, [category])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchQ.length < 2) { setSearchRes(null); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/knowledge/search?q=${encodeURIComponent(searchQ)}`)
      if (r.ok) setSearchRes(await r.json())
    }, 350)
    return () => clearTimeout(t)
  }, [searchQ])

  async function loadDetail(id: string) {
    const r = await fetch(`/api/knowledge/${id}`)
    if (r.ok) setSelected(await r.json())
  }

  async function saveArticle() {
    setSaving(true)
    const method = editing && selected ? 'PATCH' : 'POST'
    const url    = editing && selected ? `/api/knowledge/${selected.id}` : '/api/knowledge'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (r.ok) {
      setCreate(false); setEditing(false)
      setForm({ title: '', content: '', category: 'GENERAL', department: '', tags: '', status: 'DRAFT' })
      await load()
      const data = await r.json()
      await loadDetail(data.id)
    }
  }

  function startEdit(article: Article) {
    setForm({
      title:      article.title,
      content:    article.content,
      category:   article.category,
      department: article.department ?? '',
      tags:       article.tags ?? '',
      status:     article.status,
    })
    setEditing(true)
    setCreate(true)
  }

  async function publishArticle(id: string) {
    await fetch(`/api/knowledge/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PUBLISHED' }),
    })
    await load()
    await loadDetail(id)
  }

  const displayArticles = searchRes
    ? searchRes.articles.map((a) => articles.find((ar) => ar.id === a.id)).filter(Boolean) as Article[]
    : articles

  return (
    <div className="flex flex-col lg:flex-row md:h-[calc(100dvh-4rem)] md:overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">

        {/* Search */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="ค้นหาความรู้..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-sm">🔍</span>
          </div>
        </div>

        {/* Search results dropdown */}
        {searchRes && (
          <div className="border-b border-gray-100 dark:border-gray-800 bg-yellow-50 dark:bg-yellow-900/10 p-2 text-xs text-gray-600 dark:text-gray-400">
            พบ {searchRes.articles.length} บทความ · {searchRes.sops.length} SOP · {searchRes.modules.length} บทเรียน
            {searchRes.sops.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {searchRes.sops.map((s) => (
                  <div key={s.id} className="text-indigo-600 dark:text-indigo-400">📋 {s.sopCode} — {s.title}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-1 p-2 flex-wrap border-b border-gray-100 dark:border-gray-800">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                category === c.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Create button */}
        {isEditor && (
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { setCreate(true); setEditing(false); setForm({ title: '', content: '', category: 'GENERAL', department: '', tags: '', status: 'DRAFT' }) }}
              className="w-full py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              + สร้างบทความ
            </button>
          </div>
        )}

        {/* Article list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
          ) : displayArticles.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบบทความ</div>
          ) : displayArticles.map((a) => (
            <button
              key={a.id}
              onClick={() => loadDetail(a.id)}
              className={`w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${
                selected?.id === a.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg flex-shrink-0 mt-0.5">{CATEGORY_ICONS[a.category] ?? '📖'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{a.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">{CATEGORIES.find((c) => c.value === a.category)?.label ?? a.category}</span>
                    {a.status !== 'PUBLISHED' && (
                      <span className="text-xs px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {a.status === 'DRAFT' ? 'ร่าง' : 'เก็บถาวร'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">👁 {a.viewCount}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.updatedAt)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3">
            <span className="text-5xl">📖</span>
            <p className="text-sm">เลือกบทความเพื่ออ่าน</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-4 lg:p-8">
            {/* Article header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-2xl">{CATEGORY_ICONS[selected.category] ?? '📖'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                  {CATEGORIES.find((c) => c.value === selected.category)?.label ?? selected.category}
                </span>
                {selected.department && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {selected.department}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selected.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                  selected.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {selected.status === 'PUBLISHED' ? 'เผยแพร่' : selected.status === 'DRAFT' ? 'ร่าง' : 'เก็บถาวร'}
                </span>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selected.title}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                โดย {selected.createdBy.name} · อัปเดต {fmtDate(selected.updatedAt)} · เปิดดู {selected.viewCount} ครั้ง
              </p>
              {selected.tags && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {selected.tags.split(',').map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      #{t.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Article content */}
            <div className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              {selected.content.split('\n').map((line, i) => (
                <p key={i} className="mb-2 text-gray-700 dark:text-gray-300 leading-relaxed">{line || ' '}</p>
              ))}
            </div>

            {/* Actions */}
            {isEditor && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => startEdit(selected)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  ✏️ แก้ไข
                </button>
                {selected.status === 'DRAFT' && (
                  <button
                    onClick={() => publishArticle(selected.id)}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    ✅ เผยแพร่
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      {showCreate && (
        <PortalModal onClose={() => { setCreate(false); setEditing(false) }} ariaLabel={editing ? 'แก้ไขบทความ' : 'สร้างบทความใหม่'} backdropClassName="bg-black/50" panelClassName="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editing ? '✏️ แก้ไขบทความ' : '+ สร้างบทความใหม่'}
              </h2>
              <button onClick={() => { setCreate(false); setEditing(false) }} aria-label="ปิด" className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label htmlFor="field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อบทความ *</label>
                <input id="field-1"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={modalFieldInput}
                  placeholder="ชื่อบทความ"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">หมวดหมู่</label>
                  <select id="field-2"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className={modalFieldInput}
                  >
                    {CATEGORIES.filter((c) => c.value !== 'ALL').map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่าย</label>
                  <input id="field-3"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className={modalFieldInput}
                    placeholder="เช่น LAW, DEBT, HR"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">แท็ก</label>
                <input id="field-4"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className={modalFieldInput}
                  placeholder="tag1, tag2, tag3"
                />
              </div>
              <div>
                <label htmlFor="field-5" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เนื้อหา *</label>
                <textarea id="field-5"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={10}
                  className={`${modalFieldInput} resize-none`}
                  placeholder="เขียนเนื้อหาบทความ..."
                />
              </div>
              <div>
                <label htmlFor="field-6" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานะ</label>
                <select id="field-6"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className={modalFieldInput}
                >
                  <option value="DRAFT">ร่าง</option>
                  <option value="PUBLISHED">เผยแพร่</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => { setCreate(false); setEditing(false) }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                ยกเลิก
              </button>
              <button
                onClick={saveArticle}
                disabled={saving || !form.title || !form.content}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'สร้าง'}
              </button>
            </div>
        </PortalModal>
      )}
    </div>
  )
}
