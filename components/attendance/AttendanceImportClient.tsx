'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB — matches the server-side limit (app/api/attendance/import/preview/route.ts)
const CONFIRM_CHUNK_SIZE = 200 // matches the server-side max rows per confirm request

type ComputedRow = {
  rowNumber: number
  userId: string
  employeeName: string
  date: string
  checkIn: string | null
  checkOut: string | null
  lunchOut: string | null
  lunchIn: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workMinutes: number
  status: string
}

type SkippedRow = {
  rowNumber: number
  employeeCell: string
  reason: string
}

type DeductionEstimate = {
  userId: string
  employeeName: string
  lateDays: number
  billableLateMinutes: number
  estimatedDeduction: number
}

type PreviewResult = {
  fileName: string
  totalRows: number
  toCreate: ComputedRow[]
  skipped: SkippedRow[]
  estimatedDeductionByEmployee: DeductionEstimate[]
  totalEstimatedDeduction: number
}

type ConfirmResponse = {
  batchId: string
  chunkCreated: number
  chunkSkipped: SkippedRow[]
  totalCreatedSoFar: number
  totalSkippedSoFar: number
}

const money = (n: number) => `฿${n.toLocaleString('th-TH')}`

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

export default function AttendanceImportClient() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [confirmProgress, setConfirmProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmResult, setConfirmResult] = useState<{ created: number; skipped: SkippedRow[] } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setPreviewError(null)
    setConfirmProgress(null)
    setConfirmResult(null)
    setConfirmError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = (f: File | null) => {
    setPreview(null)
    setPreviewError(null)
    setConfirmResult(null)
    setConfirmError(null)
    if (f && f.size > MAX_FILE_SIZE) {
      setPreviewError(`ไฟล์ใหญ่เกิน ${MAX_FILE_SIZE / 1024 / 1024}MB — กรุณาแบ่งไฟล์`)
      setFile(null)
      return
    }
    setFile(f)
  }

  const runPreview = async () => {
    if (!file) return
    setPreviewLoading(true)
    setPreviewError(null)
    const fd = new FormData()
    fd.append('file', file)
    const { ok, status, data } = await apiJson<PreviewResult & { error?: string }>(
      '/api/attendance/import/preview',
      { method: 'POST', body: fd },
    )
    setPreviewLoading(false)
    if (!ok) {
      setPreviewError(apiErrorMessage(data, 'ตรวจสอบไฟล์ไม่สำเร็จ', status))
      return
    }
    setPreview(data)
  }

  const runConfirm = async () => {
    if (!preview || preview.toCreate.length === 0) return
    setConfirming(true)
    setConfirmError(null)
    setConfirmResult(null)

    const chunks = chunkRows(preview.toCreate, CONFIRM_CHUNK_SIZE)
    setConfirmProgress({ done: 0, total: chunks.length })

    let batchId: string | undefined
    let totalCreated = 0
    const totalSkipped: SkippedRow[] = []

    for (let i = 0; i < chunks.length; i++) {
      const isLastChunk = i === chunks.length - 1
      const { ok, status, data } = await apiJson<ConfirmResponse & { error?: string }>(
        '/api/attendance/import/confirm',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            fileName: preview.fileName,
            totalRows: preview.totalRows,
            skippedRows: i === 0 ? preview.skipped : [],
            isLastChunk,
            rows: chunks[i],
          }),
        },
      )
      if (!ok) {
        setConfirmError(apiErrorMessage(data, 'นำเข้าข้อมูลไม่สำเร็จ', status))
        setConfirming(false)
        return
      }
      batchId = data.batchId
      totalCreated += data.chunkCreated
      totalSkipped.push(...data.chunkSkipped)
      setConfirmProgress({ done: i + 1, total: chunks.length })
    }

    setConfirming(false)
    setConfirmResult({ created: totalCreated, skipped: totalSkipped })
    toast.success(`นำเข้าสำเร็จ ${totalCreated} รายการ`)
  }

  const allSkipped = confirmResult
    ? [...preview!.skipped, ...confirmResult.skipped]
    : preview?.skipped ?? []

  return (
    <div className="p-4 md:p-5 space-y-4 max-w-3xl">
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">1. เลือกไฟล์ Excel</h2>
        </div>
        <p className="text-xs text-slate-500">
          ไฟล์ .xlsx เท่านั้น ขนาดไม่เกิน 2MB และไม่เกิน 2,000 แถวต่อครั้ง — ใช้รูปแบบคอลัมน์เดียวกับไฟล์ที่ส่งออกจากระบบ
          (พนักงาน, วันที่, เช็คอิน, เช็คเอาท์, เริ่มพัก, จบพัก) ค่ามาสาย/กลับก่อน/ชั่วโมงทำงาน/สถานะ ระบบจะคำนวณใหม่เองเสมอ
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="text-xs text-slate-600 dark:text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-white/10 file:text-slate-700 dark:file:text-white"
          />
          <button
            onClick={runPreview}
            disabled={!file || previewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700 transition"
          >
            {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            ตรวจสอบไฟล์
          </button>
          {(preview || previewError) && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white/80 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              เริ่มใหม่
            </button>
          )}
        </div>
        {previewError && (
          <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {previewError}
          </p>
        )}
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">2. ตรวจสอบก่อนยืนยัน</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
              <p className="text-[11px] text-slate-500">ทั้งหมดในไฟล์</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{preview.totalRows}</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-500/10 p-3">
              <p className="text-[11px] text-green-700 dark:text-green-400">จะสร้างใหม่</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{preview.toCreate.length}</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">ข้าม</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{preview.skipped.length}</p>
            </div>
          </div>

          {preview.skipped.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-white/70 mb-1.5">แถวที่ข้าม (เหตุผล)</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">แถว</th>
                      <th className="text-left px-2 py-1.5 font-medium">พนักงานที่พิมพ์</th>
                      <th className="text-left px-2 py-1.5 font-medium">เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.skipped.map((s, i) => (
                      <tr key={`${s.rowNumber}-${i}`} className="border-t border-slate-100 dark:border-white/5">
                        <td className="px-2 py-1.5 text-slate-500">{s.rowNumber}</td>
                        <td className="px-2 py-1.5 text-slate-700 dark:text-white/80">{s.employeeCell}</td>
                        <td className="px-2 py-1.5 text-slate-500">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.estimatedDeductionByEmployee.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-white/70 mb-1.5">
                ประมาณการยอดหักเงิน (คำนวณด้วยสูตรเดียวกับ payroll generate)
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">พนักงาน</th>
                      <th className="text-right px-2 py-1.5 font-medium">วันมาสาย</th>
                      <th className="text-right px-2 py-1.5 font-medium">นาทีที่คิดหัก</th>
                      <th className="text-right px-2 py-1.5 font-medium">ประมาณการหัก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.estimatedDeductionByEmployee.map((e) => (
                      <tr key={e.userId} className="border-t border-slate-100 dark:border-white/5">
                        <td className="px-2 py-1.5 text-slate-700 dark:text-white/80">{e.employeeName}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{e.lateDays}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{e.billableLateMinutes}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-slate-900 dark:text-white">{money(e.estimatedDeduction)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 dark:border-white/10">
                      <td colSpan={3} className="px-2 py-1.5 text-right font-medium text-slate-600 dark:text-white/70">รวม</td>
                      <td className="px-2 py-1.5 text-right font-bold text-slate-900 dark:text-white">{money(preview.totalEstimatedDeduction)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {preview.toCreate.length === 0 ? (
            <p className="text-xs text-slate-500">ไม่มีแถวที่จะสร้างใหม่ — ไม่มีอะไรต้องยืนยัน</p>
          ) : !confirmResult ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={runConfirm}
                disabled={confirming}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50 hover:bg-green-700 transition"
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                ยืนยันนำเข้า {preview.toCreate.length} รายการ
              </button>
              {confirming && confirmProgress && (
                <span className="text-xs text-slate-500">
                  กำลังนำเข้า... {confirmProgress.done}/{confirmProgress.total} ชุด
                </span>
              )}
            </div>
          ) : null}

          {confirmError && (
            <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {confirmError} (บางรายการอาจนำเข้าไปแล้วก่อนเกิดข้อผิดพลาด — ตรวจสอบในหน้าประวัติการลงเวลา แล้วอัปโหลดไฟล์เดิมซ้ำได้ เพราะระบบจะข้ามแถวที่มีข้อมูลอยู่แล้วโดยอัตโนมัติ)
            </p>
          )}
        </div>
      )}

      {confirmResult && (
        <div className="rounded-xl border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-700 dark:text-green-400" />
            <h2 className="text-sm font-semibold text-green-700 dark:text-green-400">นำเข้าเสร็จสิ้น</h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-white/70">
            สร้างข้อมูลลงเวลาใหม่ {confirmResult.created} รายการ · ข้ามทั้งหมด {allSkipped.length} รายการ
          </p>
        </div>
      )}
    </div>
  )
}
