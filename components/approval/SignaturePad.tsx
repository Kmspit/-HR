'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

type SavePayload =
  | { type: 'DRAW';  data: string }
  | { type: 'TYPED'; typedName: string }
  | { type: 'UPLOAD'; data: string }

type Props = {
  onSave:   (payload: SavePayload) => void
  onCancel: () => void
}

type Mode = 'DRAW' | 'TYPED' | 'UPLOAD'

export default function SignaturePad({ onSave, onCancel }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const [mode, setMode]       = useState<Mode>('DRAW')
  const [typedName, setTyped] = useState('')
  const [isEmpty, setIsEmpty] = useState(true)
  const [drawing, setDrawing] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }, [])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (mode !== 'DRAW') return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setDrawing(true)
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    lastPos.current = pos
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing || mode !== 'DRAW') return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setIsEmpty(false)
  }

  function stopDraw() {
    setDrawing(false)
    lastPos.current = null
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setUploadPreview(result)
      setIsEmpty(false)
    }
    reader.readAsDataURL(file)
  }

  function handleSave() {
    if (mode === 'DRAW') {
      const canvas = canvasRef.current
      if (!canvas || isEmpty) return
      const data = canvas.toDataURL('image/png')
      onSave({ type: 'DRAW', data })
    } else if (mode === 'TYPED') {
      if (!typedName.trim()) return
      onSave({ type: 'TYPED', typedName: typedName.trim() })
    } else if (mode === 'UPLOAD') {
      if (!uploadPreview) return
      onSave({ type: 'UPLOAD', data: uploadPreview })
    }
  }

  const canSave = mode === 'DRAW'
    ? !isEmpty
    : mode === 'TYPED'
    ? typedName.trim().length > 0
    : !!uploadPreview

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
        {(['DRAW', 'TYPED', 'UPLOAD'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); clearCanvas(); setUploadPreview(null); setIsEmpty(true) }}
            className={`flex-1 py-2 font-medium transition-colors ${
              mode === m
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750'
            }`}
          >
            {m === 'DRAW' ? '✏️ วาด' : m === 'TYPED' ? '⌨️ พิมพ์' : '📁 อัปโหลด'}
          </button>
        ))}
      </div>

      {/* DRAW mode */}
      {mode === 'DRAW' && (
        <div>
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 cursor-crosshair touch-none select-none"
            style={{ aspectRatio: '3 / 1' }}
          >
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full h-full rounded-xl"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">วาดลายเซ็นด้วยนิ้วหรือเมาส์</p>
            <button
              onClick={clearCanvas}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ล้าง
            </button>
          </div>
        </div>
      )}

      {/* TYPED mode */}
      {mode === 'TYPED' && (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 p-6 flex flex-col items-center justify-center min-h-[100px]">
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="พิมพ์ชื่อ-นามสกุล"
            className="w-full text-center text-2xl font-serif border-0 border-b-2 border-indigo-400 dark:border-indigo-600 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none pb-2"
          />
          {typedName && (
            <p className="text-4xl font-serif text-indigo-700 dark:text-indigo-300 mt-4 italic">{typedName}</p>
          )}
        </div>
      )}

      {/* UPLOAD mode */}
      {mode === 'UPLOAD' && (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 p-6 flex flex-col items-center justify-center min-h-[120px]">
          {uploadPreview ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadPreview} alt="signature preview" className="max-h-24 mx-auto rounded" />
              <button
                onClick={() => { setUploadPreview(null); setIsEmpty(true) }}
                className="text-xs text-gray-400 mt-2 hover:text-gray-600"
              >
                เปลี่ยนรูป
              </button>
            </div>
          ) : (
            <label className="cursor-pointer text-center">
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm text-gray-600 dark:text-gray-300">เลือกไฟล์รูปลายเซ็น</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG — สูงสุด 2 MB</p>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 transition-colors"
        >
          บันทึกลายเซ็น
        </button>
      </div>
    </div>
  )
}
