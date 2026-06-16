'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface Props {
  userId: string
  userName: string
  userRole: string
}

const STORAGE_KEY = 'ai_chat_history'

export default function AiAssistantClient({ userName, userRole }: Props) {
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetch('/api/ai/suggestions')
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function saveHistory(msgs: Message[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50))) } catch { /* ignore */ }
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)
    saveHistory(next)
    setInput('')
    setLoading(true)

    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed, history }),
      })
      const data = await res.json()
      const reply = data.reply ?? data.error ?? 'ไม่สามารถรับคำตอบได้'
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, ts: Date.now() }
      const final = [...next, aiMsg]
      setMessages(final)
      saveHistory(final)
    } catch {
      const errMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'เกิดข้อผิดพลาด กรุณาลองใหม่', ts: Date.now() }
      const final = [...next, errMsg]
      setMessages(final)
      saveHistory(final)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, loading])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function clearHistory() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  const ROLE_LABEL: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', CEO: 'CEO', MANAGER_HR: 'HR Manager', HR: 'HR',
    MANAGER: 'ผู้จัดการ', TEAM_LEADER: 'หัวหน้าทีม', ADMIN: 'แอดมิน',
    EMPLOYEE: 'พนักงาน', LAWYER: 'นักกฎหมาย', ENFORCEMENT: 'บังคับคดี', CLIENT: 'ลูกค้า',
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] px-4 md:px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            AI Legal &amp; HR Assistant
          </h1>
          <p className="text-sm text-gray-500">
            {userName} — {ROLE_LABEL[userRole] ?? userRole} · ข้อมูลจริงจากระบบ
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded border border-gray-200 hover:border-red-200"
          >
            ล้างประวัติ
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4 mb-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-5xl">🤖</div>
            <div>
              <p className="text-gray-700 font-medium">สวัสดี {userName}!</p>
              <p className="text-gray-500 text-sm mt-1">ฉันคือผู้ช่วย AI ของ KM Service Plus<br />ถามฉันได้เลยเกี่ยวกับงาน คดี หรือข้อมูล HR</p>
            </div>
            {suggestions.length > 0 && (
              <div className="w-full max-w-md">
                <p className="text-xs text-gray-400 mb-2">คำถามแนะนำ</p>
                <div className="grid grid-cols-1 gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-left text-sm px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
            }`}>
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs font-medium text-blue-600">AI Assistant</span>
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
              <p className={`text-xs mt-1 ${m.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {fmtTime(m.ts)}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm">🤖</span>
                <span className="text-xs font-medium text-blue-600">AI Assistant</span>
              </div>
              <div className="flex gap-1 items-center h-5">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions row (after first message) */}
      {messages.length > 0 && suggestions.length > 0 && !loading && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-none">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 transition-colors whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="พิมพ์คำถาม... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัด)"
          rows={2}
          disabled={loading}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          aria-label="ส่ง"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
