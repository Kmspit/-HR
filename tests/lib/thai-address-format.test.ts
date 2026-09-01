import { describe, it, expect } from 'vitest'
import { formatThaiAddress } from '@/lib/thai-address-format'
import type { RegisterAddress } from '@/lib/register-form-validation'

describe('formatThaiAddress', () => {
  it('formats a full address with moo and soi', () => {
    const address: RegisterAddress = {
      houseNo: '123', moo: '4', soi: 'สุขุมวิท 5', road: 'สุขุมวิท',
      tambon: 'คลองเตย', amphoe: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
    }
    expect(formatThaiAddress(address)).toBe(
      '123 หมู่ 4 ซอย สุขุมวิท 5 ถนน สุขุมวิท ต.คลองเตย อ.คลองเตย จ.กรุงเทพมหานคร 10110',
    )
  })

  it('skips moo/soi cleanly when blank (condo/in-city address)', () => {
    const address: RegisterAddress = {
      houseNo: '99/9', moo: '', soi: '', road: 'สุขุมวิท',
      tambon: 'คลองเตย', amphoe: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
    }
    expect(formatThaiAddress(address)).toBe('99/9 ถนน สุขุมวิท ต.คลองเตย อ.คลองเตย จ.กรุงเทพมหานคร 10110')
    expect(formatThaiAddress(address)).not.toContain('หมู่')
    expect(formatThaiAddress(address)).not.toContain('ซอย')
  })

  it('returns an empty string for a fully blank address', () => {
    const address: RegisterAddress = {
      houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
    }
    expect(formatThaiAddress(address)).toBe('')
  })
})
