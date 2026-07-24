'use client'

import { useState, useEffect, useCallback } from 'react'
import PortalModal from '@/components/ui/PortalModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizOption   = { text: string; isCorrect?: boolean }
type QuizQuestion = { id: string; question: string; options: string; questionOrder: number }

type TrainingModule = {
  id: string
  title: string
  description: string | null
  department: string | null
  contentType: string
  contentUrl: string | null
  coverUrl: string | null
  targetRoles: string
  estimatedMinutes: number
  passingScore: number
  isRequired: boolean
  status: string
  createdBy: { name: string }
  createdAt: string
  updatedAt: string
  _count?: { enrollments: number; questions: number }
  enrollment?: TrainingEnrollment | null
}

type TrainingEnrollment = {
  id: string
  status: string
  score: number | null
  timeSpentMinutes: number
  startedAt: string | null
  completedAt: string | null
}

type DashboardData = {
  totalModules: number
  publishedModules: number
  totalEnrollments: number
  completionRate: number
  failedEnrollments: { module: { title: string }; user: { name: string }; score: number | null }[]
  recentModules: TrainingModule[]
}

const CONTENT_TYPE_ICONS: Record<string, string> = {
  VIDEO: '🎬', PDF: '📄', DOCUMENT: '📝', IMAGE: '🖼', MIXED: '📦',
}
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}
const ENROLL_COLORS: Record<string, string> = {
  NOT_STARTED:  'bg-gray-100 text-gray-500',
  IN_PROGRESS:  'bg-green-100 text-green-700',
  COMPLETED:    'bg-green-100 text-green-700',
  FAILED:       'bg-red-100 text-red-700',
}

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const CEO_ROLES    = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TrainingClient({
  userId, userRole,
}: { userId: string; userRole: string; userName: string }) {
  const [modules, setModules]       = useState<TrainingModule[]>([])
  const [selected, setSelected]     = useState<TrainingModule | null>(null)
  const [questions, setQuestions]   = useState<QuizQuestion[]>([])
  const [enrollment, setEnrollment] = useState<TrainingEnrollment | null>(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'all' | 'my' | 'dashboard'>('all')
  const [searchQ, setSearchQ]       = useState('')
  const [showCreate, setCreate]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [dashboard, setDashboard]   = useState<DashboardData | null>(null)

  // Quiz state
  const [quizMode, setQuizMode]     = useState(false)
  const [answers, setAnswers]       = useState<Record<string, number>>({})
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean; correct: number; total: number } | null>(null)

  // Create form
  const [form, setForm] = useState({
    title: '', description: '', department: '', contentType: 'DOCUMENT',
    contentUrl: '', estimatedMinutes: 30, passingScore: 70, isRequired: false, status: 'DRAFT',
  })

  const isEditor = EDITOR_ROLES.includes(userRole)
  const isCeo    = CEO_ROLES.includes(userRole)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab === 'my') params.set('myProgress', 'true')
    if (searchQ) params.set('q', searchQ)
    const r = await fetch(`/api/training?${params}`)
    if (r.ok) {
      const data = await r.json()
      setModules(data.items ?? [])
    }
    setLoading(false)
  }, [tab, searchQ])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab === 'dashboard' && isCeo) {
      fetch('/api/training/dashboard')
        .then((r) => r.json())
        .then(setDashboard)
    }
  }, [tab, isCeo])

  async function selectModule(m: TrainingModule) {
    const r = await fetch(`/api/training/${m.id}`)
    if (r.ok) {
      const data = await r.json()
      setSelected(data)
      setQuestions(data.questions ?? [])
      setEnrollment(data.enrollment ?? null)
      setQuizMode(false)
      setQuizResult(null)
      setAnswers({})
    }
  }

  async function enroll() {
    if (!selected) return
    const r = await fetch(`/api/training/${selected.id}/enroll`, { method: 'POST' })
    if (r.ok) {
      const enr = await r.json()
      setEnrollment(enr)
    }
  }

  async function submitQuiz() {
    if (!selected) return
    const payload = Object.entries(answers).map(([questionId, selectedIndex]) => ({ questionId, selectedIndex }))
    const r = await fetch(`/api/training/${selected.id}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: payload }),
    })
    if (r.ok) {
      const res = await r.json()
      setQuizResult({ score: res.score, passed: res.passed, correct: res.correct, total: res.total })
      setEnrollment({ ...enrollment!, status: res.passed ? 'COMPLETED' : 'FAILED', score: res.score, timeSpentMinutes: enrollment?.timeSpentMinutes ?? 0, startedAt: enrollment?.startedAt ?? null, completedAt: res.passed ? new Date().toISOString() : null })
      await load()
    }
  }

  async function saveModule() {
    setSaving(true)
    const r = await fetch('/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (r.ok) {
      setCreate(false)
      setForm({ title: '', description: '', department: '', contentType: 'DOCUMENT', contentUrl: '', estimatedMinutes: 30, passingScore: 70, isRequired: false, status: 'DRAFT' })
      await load()
    }
  }

  const displayModules = modules.filter((m) =>
    !searchQ || m.title.toLowerCase().includes(searchQ.toLowerCase())
  )

  return (
    <div className="flex flex-col lg:flex-row md:h-[calc(100dvh-4rem)] md:overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {[
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'my',  label: 'ของฉัน' },
            ...(isCeo ? [{ key: 'dashboard', label: 'ภาพรวม' }] : []),
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-gray-500'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="ค้นหาหลักสูตร..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400" />
            <span className="absolute left-2.5 top-2 text-gray-400 text-sm">🔍</span>
          </div>
        </div>

        {isEditor && tab !== 'dashboard' && (
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <button onClick={() => setCreate(true)}
              className="w-full py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
              + สร้างหลักสูตร
            </button>
          </div>
        )}

        {/* Module list */}
        {tab !== 'dashboard' && (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
            ) : displayModules.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">ไม่พบหลักสูตร</div>
            ) : displayModules.map((m) => (
              <button key={m.id} onClick={() => selectModule(m)}
                className={`w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                  selected?.id === m.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                }`}>
                <div className="flex items-start gap-2">
                  <span className="text-2xl flex-shrink-0">{CONTENT_TYPE_ICONS[m.contentType] ?? '📦'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded-md ${STATUS_COLORS[m.status] ?? ''}`}>
                        {m.status === 'PUBLISHED' ? 'เผยแพร่' : m.status === 'DRAFT' ? 'ร่าง' : 'เก็บถาวร'}
                      </span>
                      {m.isRequired && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md">จำเป็น</span>}
                      {m.enrollment && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${ENROLL_COLORS[m.enrollment.status]}`}>
                          {m.enrollment.status === 'COMPLETED' ? '✓ ผ่าน' : m.enrollment.status === 'FAILED' ? '✗ ไม่ผ่าน' : m.enrollment.status === 'IN_PROGRESS' ? 'กำลังเรียน' : 'ยังไม่เริ่ม'}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{m.estimatedMinutes} นาที</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Dashboard sidebar summary */}
        {tab === 'dashboard' && isCeo && dashboard && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'หลักสูตรทั้งหมด', value: dashboard.totalModules, color: 'text-indigo-600' },
                { label: 'ลงทะเบียนทั้งหมด', value: dashboard.totalEnrollments, color: 'text-green-600' },
                { label: 'อัตราสำเร็จ', value: `${dashboard.completionRate}%`, color: 'text-green-600' },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">ไม่ผ่านล่าสุด</p>
              {dashboard.failedEnrollments.slice(0, 5).map((fe) => (
                <div key={fe.user.name + '-' + fe.module.title} className="text-xs py-1 border-b border-gray-100 dark:border-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{fe.user.name}</span>
                  <span className="text-gray-500"> — {fe.module.title}</span>
                  {fe.score !== null && <span className="text-red-500 ml-1">({fe.score}%)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {!selected && tab !== 'dashboard' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3">
            <span className="text-5xl">🎓</span>
            <p className="text-sm">เลือกหลักสูตรเพื่อเริ่มเรียน</p>
          </div>
        )}

        {tab === 'dashboard' && isCeo && dashboard && (
          <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ภาพรวม Training System</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'หลักสูตรทั้งหมด', value: dashboard.totalModules },
                { label: 'เผยแพร่แล้ว', value: dashboard.publishedModules },
                { label: 'ลงทะเบียนทั้งหมด', value: dashboard.totalEnrollments },
                { label: 'อัตราสำเร็จ', value: `${dashboard.completionRate}%` },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{kpi.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{kpi.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">หลักสูตรล่าสุด</h3>
              <div className="space-y-2">
                {dashboard.recentModules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{m.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[m.status]}`}>
                      {m.status === 'PUBLISHED' ? 'เผยแพร่' : 'ร่าง'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">ผู้เรียนที่ไม่ผ่าน</h3>
              <div className="space-y-2">
                {dashboard.failedEnrollments.map((fe) => (
                  <div key={fe.user.name + '-' + fe.module.title} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{fe.user.name}</span>
                      <span className="text-gray-500"> — {fe.module.title}</span>
                    </div>
                    {fe.score !== null && <span className="text-red-500 text-xs font-medium">{fe.score}%</span>}
                  </div>
                ))}
                {dashboard.failedEnrollments.length === 0 && <p className="text-sm text-gray-400">ไม่มีผู้เรียนที่ไม่ผ่าน</p>}
              </div>
            </div>
          </div>
        )}

        {selected && tab !== 'dashboard' && (
          <div className="max-w-3xl mx-auto p-4 lg:p-6">
            {/* Module header */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
              <div className="flex items-start gap-4">
                <span className="text-4xl">{CONTENT_TYPE_ICONS[selected.contentType] ?? '📦'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[selected.status]}`}>
                      {selected.status === 'PUBLISHED' ? 'เผยแพร่' : 'ร่าง'}
                    </span>
                    {selected.isRequired && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-md">จำเป็น</span>}
                    <span className="text-xs text-gray-400">⏱ {selected.estimatedMinutes} นาที</span>
                    <span className="text-xs text-gray-400">🎯 ผ่าน {selected.passingScore}%</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selected.title}</h2>
                  {selected.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selected.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">โดย {selected.createdBy.name} · {fmtDate(selected.createdAt)}</p>
                </div>
              </div>

              {/* Enrollment status */}
              {enrollment ? (
                <div className={`mt-4 rounded-lg p-3 flex items-center justify-between ${
                  enrollment.status === 'COMPLETED' ? 'bg-green-50 dark:bg-green-900/10' :
                  enrollment.status === 'FAILED'    ? 'bg-red-50 dark:bg-red-900/10' :
                  'bg-green-50 dark:bg-green-900/10'
                }`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {enrollment.status === 'COMPLETED' ? '✅ ผ่านแล้ว' : enrollment.status === 'FAILED' ? '❌ ไม่ผ่าน' : '📖 กำลังเรียน'}
                      {enrollment.score !== null && ` (${enrollment.score}%)`}
                    </p>
                    {enrollment.completedAt && <p className="text-xs text-gray-500">สำเร็จเมื่อ {fmtDate(enrollment.completedAt)}</p>}
                  </div>
                  {questions.length > 0 && (enrollment.status === 'IN_PROGRESS' || enrollment.status === 'FAILED') && (
                    <button onClick={() => { setQuizMode(true); setQuizResult(null); setAnswers({}) }}
                      className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
                      {enrollment.status === 'FAILED' ? '🔄 ทำอีกครั้ง' : '📝 ทำแบบทดสอบ'}
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={enroll}
                  className="mt-4 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">
                  📚 ลงทะเบียนเรียน
                </button>
              )}
            </div>

            {/* Content link */}
            {selected.contentUrl && !quizMode && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">เนื้อหาหลักสูตร</h3>
                <a href={selected.contentUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 underline">
                  {CONTENT_TYPE_ICONS[selected.contentType]} เปิดเนื้อหา ({selected.contentType})
                </a>
              </div>
            )}

            {/* Quiz interface */}
            {quizMode && questions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
                {quizResult ? (
                  <div className="text-center py-6">
                    <span className="text-5xl">{quizResult.passed ? '🎉' : '😢'}</span>
                    <h3 className="text-2xl font-bold mt-3 text-gray-900 dark:text-gray-100">{quizResult.score}%</h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      ถูก {quizResult.correct}/{quizResult.total} ข้อ
                    </p>
                    <p className={`text-sm font-medium mt-2 ${quizResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {quizResult.passed ? '✅ ผ่านแล้ว!' : `❌ ไม่ผ่าน — ต้องได้ ${selected.passingScore}% ขึ้นไป`}
                    </p>
                    <button onClick={() => { setQuizMode(false); setQuizResult(null) }}
                      className="mt-4 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      ← กลับ
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        แบบทดสอบ ({questions.length} ข้อ)
                      </h3>
                      <span className="text-xs text-gray-400">ต้องได้ {selected.passingScore}% ขึ้นไป</span>
                    </div>
                    <div className="space-y-5">
                      {questions.sort((a, b) => a.questionOrder - b.questionOrder).map((q, qi) => {
                        const opts = JSON.parse(q.options) as QuizOption[]
                        return (
                          <div key={q.id}>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                              {qi + 1}. {q.question}
                            </p>
                            <div className="space-y-1.5">
                              {opts.map((opt, oi) => (
                                <label key={oi} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                                  answers[q.id] === oi
                                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}>
                                  <input type="radio" name={q.id} value={oi}
                                    checked={answers[q.id] === oi}
                                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                                    className="accent-indigo-600" />
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{opt.text}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-5 flex justify-end">
                      <button
                        onClick={submitQuiz}
                        disabled={Object.keys(answers).length < questions.length}
                        className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                        ส่งคำตอบ ({Object.keys(answers).length}/{questions.length})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showCreate && isEditor && (
        <PortalModal onClose={() => setCreate(false)} ariaLabel="สร้างหลักสูตร" backdropClassName="bg-black/50" panelClassName="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">+ สร้างหลักสูตร</h2>
              <button type="button" onClick={() => setCreate(false)} aria-label="ปิด" className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label htmlFor="field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อหลักสูตร *</label>
                <input id="field-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="ชื่อหลักสูตร" />
              </div>
              <div>
                <label htmlFor="field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำอธิบาย</label>
                <textarea id="field-2" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ประเภทเนื้อหา</label>
                  <select id="field-3" value={form.contentType} onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                    {['VIDEO', 'PDF', 'DOCUMENT', 'IMAGE', 'MIXED'].map((t) => (
                      <option key={t} value={t}>{CONTENT_TYPE_ICONS[t]} {t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่าย</label>
                  <input id="field-4" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                    placeholder="เช่น LAW, HR" />
                </div>
              </div>
              <div>
                <label htmlFor="field-5" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL เนื้อหา</label>
                <input id="field-5" value={form.contentUrl} onChange={(e) => setForm((f) => ({ ...f, contentUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-6" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เวลาโดยประมาณ (นาที)</label>
                  <input id="field-6" type="number" value={form.estimatedMinutes} onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: +e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" min={5} />
                </div>
                <div>
                  <label htmlFor="field-7" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คะแนนผ่าน (%)</label>
                  <input id="field-7" type="number" value={form.passingScore} onChange={(e) => setForm((f) => ({ ...f, passingScore: +e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" min={0} max={100} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
                    className="accent-indigo-600" />
                  หลักสูตรจำเป็น (บังคับ)
                </label>
              </div>
              <div>
                <label htmlFor="field-8" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานะ</label>
                <select id="field-8" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                  <option value="DRAFT">ร่าง</option>
                  <option value="PUBLISHED">เผยแพร่</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">ยกเลิก</button>
              <button type="button" onClick={saveModule} disabled={saving || !form.title}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'กำลังบันทึก…' : 'สร้าง'}
              </button>
            </div>
        </PortalModal>
      )}
    </div>
  )
}
