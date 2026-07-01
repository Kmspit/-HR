import { describe, expect, it } from 'vitest'
import { formatApprovalCenterSummary } from '@/lib/approval-inbox'

describe('formatApprovalCenterSummary', () => {
  it('lists only core approval types', () => {
    const summary = formatApprovalCenterSummary(
      { leave: 2, outside: 1, weekly: 0, forgotScan: 1, total: 4 },
      'MANAGER_HR',
    )
    expect(summary).toContain('ลา 2')
    expect(summary).toContain('นอก 1')
    expect(summary).toContain('แก้เวลา 1')
    expect(summary).not.toContain('เอกสาร')
    expect(summary).not.toContain('เบิก')
  })
})
