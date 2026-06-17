'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[HRFlow] Global error:', error.message, error.digest)
  }, [error])

  return (
    <html lang="th">
      <body style={{
        margin: 0,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#0f172a',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1rem',
      }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            ระบบเกิดข้อผิดพลาด
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 8px' }}>
            กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ
          </p>
          {error.message && (
            <p style={{
              color: '#f87171', fontSize: 12, fontFamily: 'monospace',
              background: 'rgba(239,68,68,0.1)', borderRadius: 8,
              padding: '8px 12px', margin: '0 0 12px', wordBreak: 'break-all',
            }}>
              {error.message}
            </p>
          )}
          {error.digest && (
            <p style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', margin: '0 0 24px' }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px', background: '#2563eb', color: 'white',
                border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              ลองใหม่
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              style={{
                padding: '10px 24px', background: 'rgba(255,255,255,0.1)', color: '#f8fafc',
                border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              กลับ Dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
