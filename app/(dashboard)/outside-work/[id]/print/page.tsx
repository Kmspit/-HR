import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { hasPermission } from '@/lib/access-control'
import type { Role } from '@prisma/client'
import { KM_COMPANY } from '@/lib/company-defaults'

export const metadata = { title: 'พิมพ์ใบขออนุมัติออกนอกสถานที่' }

const DAY_TH  = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function fmtDateLong(d: Date | string): string {
  const dt = new Date(d)
  return `วัน${DAY_TH[dt.getUTCDay()]}ที่ ${dt.getUTCDate()} ${MONTH_TH[dt.getUTCMonth()]} พ.ศ. ${dt.getUTCFullYear() + 543}`
}

function fmtDateShort(d: Date | string): string {
  const dt = new Date(d)
  return `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}/${dt.getUTCFullYear() + 543}`
}

const STATUS_TH: Record<string, string> = {
  PENDING: 'รออนุมัติ', pending_ceo: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว', approved_by_ceo: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ', rejected_by_ceo: 'ไม่อนุมัติ',
}

export default async function PrintOutsideWorkPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const request = await prisma.outsideWorkRequest.findUnique({
    where: { id },
    select: {
      id: true, userId: true, date: true, place: true, purpose: true,
      timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
      workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, note: true,
      status: true, approvalStatus: true, documentNumber: true, createdAt: true,
      clientCompanyId: true,
      clientCompany: { select: { companyName: true } },
      user: { select: { name: true, department: true, position: true } },
      approvals: {
        select: {
          id: true, action: true, reason: true, createdAt: true,
          approvedBy: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!request) notFound()

  const companySettings = await prisma.companySettings.findUnique({
    where: { id: 'singleton' },
    select: { companyName: true },
  }).catch(() => null)
  const companyName = companySettings?.companyName || KM_COMPANY.companyName

  const canView =
    request.userId === session.user.id ||
    hasPermission(session.user.role as Role, 'approve_outside_work')
  if (!canView) redirect('/')

  const effectiveStatus = request.approvalStatus ?? request.status
  const isApproved = ['APPROVED', 'approved_by_ceo'].includes(effectiveStatus)
  const isRejected = ['REJECTED', 'rejected_by_ceo'].includes(effectiveStatus)
  const approver   = request.approvals[request.approvals.length - 1]

  return (
    <html lang="th">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ใบขออนุมัติออกนอกสถานที่ — {request.documentNumber ?? request.id.slice(0, 8).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Noto Sans Thai', system-ui, sans-serif;
            font-size: 14px;
            color: #111827;
            background: #f3f4f6;
          }
          .print-btn {
            position: fixed; top: 16px; right: 16px;
            background: #22c55e; color: #fff;
            border: none; padding: 10px 20px;
            border-radius: 8px; cursor: pointer;
            font-size: 14px; font-weight: 600;
            font-family: inherit; z-index: 100;
            display: flex; align-items: center; gap: 8px;
          }
          .print-btn:hover { background: #16a34a; }
          .page {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            margin: 24px auto;
            padding: 20mm 18mm;
            position: relative;
            box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          }

          /* ── Header ── */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #22c55e;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .company-block { }
          .company-name { font-size: 17px; font-weight: 800; color: #16a34a; }
          .company-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }
          .doc-block { text-align: right; }
          .doc-title { font-size: 16px; font-weight: 800; color: #16a34a; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; font-family: monospace; }
          .doc-date   { font-size: 11px; color: #6b7280; margin-top: 3px; }
          .status-badge {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 10px;
            border-radius: 99px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.03em;
          }
          .status-pending  { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
          .status-approved { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
          .status-rejected { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

          /* ── Employee info grid ── */
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 18px;
          }
          .info-box {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 14px;
            background: #f9fafb;
          }
          .info-box-full { grid-column: 1 / -1; }
          .info-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
          .info-value { font-size: 13px; color: #111827; font-weight: 500; }

          /* ── Section heading ── */
          .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #16a34a;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border-left: 3px solid #22c55e;
            padding-left: 8px;
            margin: 18px 0 10px;
          }

          /* ── Detail table ── */
          .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          .detail-table th {
            background: #16a34a;
            color: #fff;
            padding: 8px 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.03em;
            white-space: nowrap;
          }
          .detail-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #f3f4f6;
            font-size: 12px;
            vertical-align: top;
          }
          .detail-table tr:nth-child(even) td { background: #f9fafb; }
          .detail-table .label-col { font-weight: 600; color: #374151; white-space: nowrap; width: 40%; }
          .detail-table .value-col { color: #111827; }

          /* ── Approval section ── */
          .approval-section {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 24px;
            margin-top: 40px;
          }
          .sig-box { text-align: center; }
          .sig-area {
            height: 52px;
            border-bottom: 1px solid #374151;
            margin-bottom: 6px;
          }
          .sig-label { font-size: 11px; color: #374151; font-weight: 600; }
          .sig-sub   { font-size: 10px; color: #9ca3af; margin-top: 3px; }

          /* ── Watermark ── */
          .watermark {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 72px;
            font-weight: 900;
            pointer-events: none;
            white-space: nowrap;
            z-index: 0;
            opacity: 0.07;
          }
          .watermark-approved { color: #059669; }
          .watermark-rejected { color: #dc2626; }

          /* ── Footer ── */
          .page-footer {
            margin-top: 32px;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
            font-size: 10px;
            color: #9ca3af;
            text-align: center;
          }

          /* ── Print styles ── */
          @media print {
            body { background: #fff; }
            .page { margin: 0; padding: 15mm 14mm; width: 100%; box-shadow: none; }
            .print-btn { display: none !important; }
          }
        `}</style>
      </head>
      <body>
        <button className="print-btn no-print" id="printBtn">
          🖨️ พิมพ์ / บันทึก PDF
        </button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('printBtn').onclick=()=>window.print()` }} />

        <div className="page">
          {isApproved && <div className="watermark watermark-approved">อนุมัติแล้ว</div>}
          {isRejected && <div className="watermark watermark-rejected">ไม่อนุมัติ</div>}

          {/* ── Company header ── */}
          <div className="header">
            <div className="company-block">
              <div className="company-name">{companyName}</div>
              <div className="company-sub">KM Service Plus Co., Ltd.</div>
              <div className="company-sub" style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                ใบขออนุมัติออกนอกสถานที่ปฏิบัติงาน
              </div>
            </div>
            <div className="doc-block">
              <div className="doc-title">Outside Work Request</div>
              <div className="doc-number">
                เลขที่: {request.documentNumber ?? '—'}
              </div>
              <div className="doc-date">
                วันที่สร้าง: {fmtDateShort(request.createdAt)}
              </div>
              <div>
                <span className={`status-badge ${isApproved ? 'status-approved' : isRejected ? 'status-rejected' : 'status-pending'}`}>
                  {STATUS_TH[effectiveStatus] ?? effectiveStatus}
                </span>
              </div>
            </div>
          </div>

          {/* ── Employee info ── */}
          <div className="section-title">ข้อมูลพนักงาน</div>
          <div className="info-grid">
            <div className="info-box">
              <div className="info-label">ชื่อ-นามสกุล</div>
              <div className="info-value">{request.user.name}</div>
            </div>
            <div className="info-box">
              <div className="info-label">แผนก / ตำแหน่ง</div>
              <div className="info-value">{request.user.department ?? '—'} · {request.user.position ?? '—'}</div>
            </div>
          </div>

          {/* ── Trip detail ── */}
          <div className="section-title">รายละเอียดการออกนอกสถานที่</div>
          <table className="detail-table">
            <tbody>
              <tr>
                <td className="label-col">วันที่ออกนอกสถานที่</td>
                <td className="value-col" colSpan={3}>{fmtDateLong(request.date)}</td>
              </tr>
              {request.timeSlot && (
                <tr>
                  <td className="label-col">ช่วงเวลา</td>
                  <td className="value-col" colSpan={3}>{request.timeSlot}</td>
                </tr>
              )}
              <tr>
                <td className="label-col">สถานที่ไปทำงาน</td>
                <td className="value-col" colSpan={3}>{request.place}</td>
              </tr>
              {request.clientCompany && (
                <tr>
                  <td className="label-col">บริษัทลูกค้า</td>
                  <td className="value-col" colSpan={3}>{request.clientCompany.companyName}</td>
                </tr>
              )}
              <tr>
                <td className="label-col">สิ่งที่ไปดำเนินการ</td>
                <td className="value-col" colSpan={3} style={{ whiteSpace: 'pre-wrap' }}>{request.purpose}</td>
              </tr>
              {request.caseNumber && (
                <tr>
                  <td className="label-col">หมายเลขคดีดำ</td>
                  <td className="value-col">{request.caseNumber}</td>
                  <td className="label-col">จำนวนคดี</td>
                  <td className="value-col">{request.caseCount ?? '—'} คดี</td>
                </tr>
              )}
              {(request.productCategory || request.productWork) && (
                <tr>
                  <td className="label-col">งานโปรดักส์</td>
                  <td className="value-col">
                    {request.productCategory
                      ? `${request.productCategory}${request.productType ? ' > ' + request.productType : ''}`
                      : request.productWork}
                  </td>
                  <td className="label-col">งานของสาขา</td>
                  <td className="value-col">{request.workBranch ?? '—'}</td>
                </tr>
              )}
              {request.adminChecked && (
                <tr>
                  <td className="label-col">แอดมินโปรดักส์ตรวจสอบ</td>
                  <td className="value-col">{request.adminChecked}</td>
                  <td className="label-col">ผู้สั่งงาน</td>
                  <td className="value-col">{request.supervisedBy ?? '—'}</td>
                </tr>
              )}
              {request.note && (
                <tr>
                  <td className="label-col">หมายเหตุ</td>
                  <td className="value-col" colSpan={3}>{request.note}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── Approval history ── */}
          {request.approvals.length > 0 && (
            <>
              <div className="section-title">ประวัติการอนุมัติ</div>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>ผู้ดำเนินการ</th>
                    <th>ตำแหน่ง</th>
                    <th>การดำเนินการ</th>
                    <th>วันที่</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {request.approvals.map((a) => (
                    <tr key={a.id}>
                      <td>{a.approvedBy.name}</td>
                      <td style={{ fontSize: 11, color: '#6b7280' }}>{a.approvedBy.role}</td>
                      <td>
                        <span style={{
                          fontWeight: 600,
                          color: a.action === 'APPROVE' ? '#059669' : '#dc2626',
                        }}>
                          {a.action === 'APPROVE' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>{fmtDateShort(a.createdAt)}</td>
                      <td style={{ color: '#6b7280', fontSize: 11 }}>{a.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Signature boxes ── */}
          <div className="approval-section">
            <div className="sig-box">
              <div className="sig-area">
                {isApproved && approver && (
                  <div style={{ paddingTop: 12, fontSize: 12, color: '#059669', fontWeight: 600 }}>
                    {approver.approvedBy.name}
                  </div>
                )}
              </div>
              <div className="sig-label">ผู้อนุมัติ / CEO</div>
              <div className="sig-sub">วันที่ {isApproved && approver ? fmtDateShort(approver.createdAt) : '..................'}</div>
            </div>
            <div className="sig-box">
              <div className="sig-area" />
              <div className="sig-label">ผู้ขอ / Employee</div>
              <div className="sig-sub">{request.user.name}</div>
            </div>
            <div className="sig-box">
              <div className="sig-area" />
              <div className="sig-label">ผู้รับทราบ / Acknowledged</div>
              <div className="sig-sub">วันที่ ..................</div>
            </div>
          </div>

          <div className="page-footer">
            เอกสารนี้สร้างโดยระบบ HRFlow · เค เอ็ม เซอร์วิส พลัส จำกัด ·
            เลขที่เอกสาร {request.documentNumber ?? id} ·
            พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
          </div>
        </div>
      </body>
    </html>
  )
}
