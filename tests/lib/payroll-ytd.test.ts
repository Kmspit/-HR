import { describe, it, expect } from 'vitest'
import { computePayrollYtdFromRows, type PayrollYtdRow } from '@/lib/payroll-ytd'

function row(overrides: Partial<PayrollYtdRow> = {}): PayrollYtdRow {
  return {
    baseSalary: 30_000,
    positionAllowance: 0,
    diligenceAllowance: 0,
    backPay: 0,
    commission: 0,
    overtimePay: 0,
    bonus: 0,
    taxDeduction: 500,
    socialSecurity: 875,
    taxScheme: 'NORMAL',
    ...overrides,
  }
}

describe('computePayrollYtdFromRows — 4 ยอดสะสมสำหรับ 50 ทวิ', () => {
  it('empty year → all zeros', () => {
    expect(computePayrollYtdFromRows([])).toEqual({
      income: 0,
      taxNormal: 0,
      taxOffSystemWht: 0,
      socialSecurity: 0,
    })
  })

  it('รายได้สะสม รวมทุก field ยกเว้น professionalFee (ไม่มี field นี้ใน row เลย — แยกระบบภาษี)', () => {
    const rows = [
      row({ baseSalary: 30_000, positionAllowance: 2_000, diligenceAllowance: 500, backPay: 1_000, commission: 3_000, overtimePay: 800, bonus: 5_000 }),
    ]
    const result = computePayrollYtdFromRows(rows)
    expect(result.income).toBe(30_000 + 2_000 + 500 + 1_000 + 3_000 + 800 + 5_000)
  })

  it('ประกันสังคมสะสม = SUM(socialSecurity) ทุกแถวตรงๆ ไม่สนใจ taxScheme', () => {
    const rows = [
      row({ taxScheme: 'NORMAL', socialSecurity: 875 }),
      row({ taxScheme: 'OFF_SYSTEM_WHT', socialSecurity: 0 }),
      row({ taxScheme: 'NORMAL', socialSecurity: 800 }),
    ]
    expect(computePayrollYtdFromRows(rows).socialSecurity).toBe(875 + 0 + 800)
  })

  it('null taxScheme (สลิปเก่าก่อน feature นี้) นับเป็น NORMAL ไม่ใช่ OFF_SYSTEM_WHT', () => {
    const rows = [row({ taxScheme: null, taxDeduction: 300 })]
    const result = computePayrollYtdFromRows(rows)
    expect(result.taxNormal).toBe(300)
    expect(result.taxOffSystemWht).toBe(0)
  })

  it(
    'กรณีเปลี่ยน taxScheme กลางปี (ม.ค.-มี.ค. NORMAL, เม.ย.+ OFF_SYSTEM_WHT) — ' +
    'ภาษีสะสม/WHT สะสม ต้องแยกตาม taxScheme ที่ SNAPSHOT ไว้จริงของแต่ละเดือน',
    () => {
      const rows: PayrollYtdRow[] = [
        row({ taxScheme: 'NORMAL', taxDeduction: 200 }), // ม.ค.
        row({ taxScheme: 'NORMAL', taxDeduction: 210 }), // ก.พ.
        row({ taxScheme: 'NORMAL', taxDeduction: 220 }), // มี.ค.
        row({ taxScheme: 'OFF_SYSTEM_WHT', taxDeduction: 900 }), // เม.ย. — เปลี่ยน scheme
        row({ taxScheme: 'OFF_SYSTEM_WHT', taxDeduction: 900 }), // พ.ค.
      ]

      const result = computePayrollYtdFromRows(rows)

      // ภาษีสะสม (NORMAL) ต้องนับเฉพาะ ม.ค.-มี.ค. — ไม่รวมเดือนที่เปลี่ยนไป OFF_SYSTEM_WHT แล้ว
      expect(result.taxNormal).toBe(200 + 210 + 220)
      // WHT สะสม (OFF_SYSTEM_WHT) ต้องนับเฉพาะ เม.ย.-พ.ค. — ไม่ปนกับ 3 เดือนแรก
      expect(result.taxOffSystemWht).toBe(900 + 900)
      // ยอดสะสมทั้งสองต้องไม่ปนกัน (ผลรวมของทั้งคู่ = SUM(taxDeduction) ทุกแถว)
      expect(result.taxNormal + result.taxOffSystemWht).toBe(
        rows.reduce((s, r) => s + r.taxDeduction, 0),
      )
    },
  )

  it(
    'สลับกลับ NORMAL → OFF_SYSTEM_WHT → NORMAL อีกครั้งกลางปี ก็ยังแยกถูกตามแต่ละแถว ' +
    '(ไม่ใช่ตาม taxScheme ปัจจุบันของ user ที่อาจเป็นค่าสุดท้าย)',
    () => {
      const rows: PayrollYtdRow[] = [
        row({ taxScheme: 'NORMAL', taxDeduction: 100 }),
        row({ taxScheme: 'OFF_SYSTEM_WHT', taxDeduction: 300 }),
        row({ taxScheme: 'NORMAL', taxDeduction: 150 }),
      ]
      const result = computePayrollYtdFromRows(rows)
      expect(result.taxNormal).toBe(100 + 150)
      expect(result.taxOffSystemWht).toBe(300)
    },
  )
})
