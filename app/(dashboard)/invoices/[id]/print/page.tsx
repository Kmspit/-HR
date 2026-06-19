import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export const metadata = { title: 'พิมพ์ใบแจ้งหนี้' }

interface LineItem { description: string; qty: number; unitPrice: number; amount: number }

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' })

const STATUS_TH: Record<string, string> = {
  DRAFT: 'แบบร่าง', SENT: 'ส่งแล้ว', PENDING_PAYMENT: 'รอชำระ',
  PAID: 'ชำระแล้ว', OVERDUE: 'เกินกำหนด', CANCELLED: 'ยกเลิก',
}

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id },
    include: {
      clientCompany: true,
      receipts:      { orderBy: { issuedAt: 'asc' }, take: 1 },
      createdBy:     { select: { name: true } },
    },
  })
  if (!invoice) notFound()

  let lineItems: LineItem[] = []
  try { lineItems = JSON.parse(invoice.lineItems) } catch {}

  const isReceipt = invoice.receipts.length > 0
  const receipt   = invoice.receipts[0]
  const docTitle  = isReceipt ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี' : 'ใบแจ้งหนี้'

  return (
    <html lang="th">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{docTitle} — {isReceipt ? receipt?.receiptNumber : invoice.invoiceNumber}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; font-size: 13px; color: #1a1a1a; background: #f5f5f5; }
          .page { background: white; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm; position: relative; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; }
          .company-name { font-size: 20px; font-weight: 800; color: #1e3a8a; }
          .company-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 18px; font-weight: 700; color: #1e3a8a; }
          .doc-number { font-size: 13px; color: #374151; margin-top: 4px; }
          .status-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #dbeafe; color: #1d4ed8; margin-top: 4px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .info-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
          .info-value { font-size: 13px; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #1e3a8a; color: white; padding: 8px 10px; text-align: left; font-size: 12px; }
          td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
          tr:nth-child(even) td { background: #f9fafb; }
          .amount-col { text-align: right; }
          .totals { margin-left: auto; width: 280px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
          .totals-row { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 13px; }
          .totals-row.divider { border-top: 2px solid #e5e7eb; }
          .totals-row.grand-total { background: #1e3a8a; color: white; font-weight: 700; font-size: 15px; }
          .totals-row.paid-row { background: #dcfce7; color: #166534; }
          .totals-row.due-row { background: #fee2e2; color: #991b1b; font-weight: 700; }
          .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .sig-box { text-align: center; }
          .sig-line { border-top: 1px solid #374151; margin-top: 48px; padding-top: 6px; font-size: 11px; color: #6b7280; }
          .note-box { margin-top: 20px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; font-size: 12px; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72px; font-weight: 900; color: rgba(220,252,231,0.6); pointer-events: none; white-space: nowrap; z-index: 0; }
          @media print {
            body { background: white; }
            .page { width: 100%; margin: 0; padding: 15mm; box-shadow: none; }
            .no-print { display: none !important; }
          }
          .print-btn { position: fixed; top: 16px; right: 16px; background: #1e3a8a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; z-index: 100; }
        `}</style>
      </head>
      <body>
        <button className="print-btn no-print" onClick={() => {}} id="printBtn">🖨️ พิมพ์ / บันทึก PDF</button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('printBtn').onclick=()=>window.print()` }} />

        <div className="page">
          {invoice.status === 'PAID' && <div className="watermark">ชำระแล้ว</div>}

          {/* Company header */}
          <div className="header">
            <div>
              <div className="company-name">เค เอ็ม เซอร์วิส พลัส จำกัด</div>
              <div className="company-sub">KM Service Plus Co., Ltd.</div>
              <div className="company-sub">เลขประจำตัวผู้เสียภาษี: (ระบุในการตั้งค่า)</div>
            </div>
            <div className="doc-title">
              <h1>{docTitle}</h1>
              <div className="doc-number">เลขที่: {isReceipt ? receipt?.receiptNumber : invoice.invoiceNumber}</div>
              {isReceipt && <div className="doc-number" style={{ fontSize: '11px', color: '#6b7280' }}>อ้างอิงใบแจ้งหนี้: {invoice.invoiceNumber}</div>}
              <span className="status-badge">{STATUS_TH[invoice.status] ?? invoice.status}</span>
            </div>
          </div>

          {/* Client + date info */}
          <div className="info-grid">
            <div className="info-box">
              <div className="info-label">ลูกค้า</div>
              <div className="info-value" style={{ fontWeight: 600 }}>{invoice.clientName}</div>
              {invoice.clientTaxId && <div className="info-value" style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>เลขภาษี: {invoice.clientTaxId}</div>}
              {invoice.clientAddress && <div className="info-value" style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{invoice.clientAddress}</div>}
            </div>
            <div className="info-box">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div className="info-label">วันที่ออก</div>
                  <div className="info-value">{fmtDate(invoice.issueDate)}</div>
                </div>
                <div>
                  <div className="info-label">วันครบกำหนด</div>
                  <div className="info-value" style={{ color: invoice.status === 'OVERDUE' ? '#dc2626' : 'inherit' }}>{fmtDate(invoice.dueDate)}</div>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <div className="info-label">ประเภทบริการ</div>
                  <div className="info-value">{invoice.serviceType}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>รายการ</th>
                  <th className="amount-col">จำนวน</th>
                  <th className="amount-col">ราคาต่อหน่วย</th>
                  <th className="amount-col">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.description || String(i)}>
                    <td>{i + 1}</td>
                    <td>{item.description}</td>
                    <td className="amount-col">{item.qty}</td>
                    <td className="amount-col">฿{fmt(item.unitPrice)}</td>
                    <td className="amount-col">฿{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div className="totals">
              <div className="totals-row"><span>ยอดก่อนภาษี</span><span>฿{fmt(invoice.subtotal)}</span></div>
              <div className="totals-row"><span>VAT {(invoice.vatRate * 100).toFixed(0)}%</span><span>฿{fmt(invoice.vatAmount)}</span></div>
              {invoice.whtAmount > 0 && <div className="totals-row"><span>หัก ณ ที่จ่าย {(invoice.whtRate * 100).toFixed(0)}%</span><span>-฿{fmt(invoice.whtAmount)}</span></div>}
              <div className="totals-row grand-total divider"><span>ยอดสุทธิ</span><span>฿{fmt(invoice.totalAmount)}</span></div>
              {invoice.paidAmount > 0 && <div className="totals-row paid-row"><span>ชำระแล้ว</span><span>฿{fmt(invoice.paidAmount)}</span></div>}
              {invoice.remainingAmount > 0 && <div className="totals-row due-row"><span>คงค้าง</span><span>฿{fmt(invoice.remainingAmount)}</span></div>}
            </div>
          </div>

          {invoice.note && (
            <div className="note-box"><strong>หมายเหตุ:</strong> {invoice.note}</div>
          )}

          {/* Signatures */}
          <div className="footer">
            <div className="sig-box">
              <div className="sig-line">ผู้รับเงิน / Received by</div>
            </div>
            <div className="sig-box">
              <div className="sig-line">ผู้มีอำนาจลงนาม / Authorized Signature</div>
            </div>
          </div>

          <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 32, textAlign: 'center' }}>
            เอกสารนี้ออกโดยระบบ HRFlow · KM Service Plus · สร้างโดย {invoice.createdBy.name}
          </p>
        </div>
      </body>
    </html>
  )
}
