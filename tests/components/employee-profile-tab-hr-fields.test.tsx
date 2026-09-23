// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { mockApiJson, profileFixture } = vi.hoisted(() => {
  const profileFixture = {
    nationality: 'ไทย', maritalStatus: '', personalEmail: '', religion: '', paymentMethod: '',
    currentAddress: { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' },
    registeredAddress: { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' },
    sameAsCurrentAddress: false,
    bloodType: '', fatherName: '', fatherOccupation: '', motherName: '', motherOccupation: '',
    siblingsTotal: 0, siblingsOrder: 0,
    educationLevel: '', educationInstitution: '', educationMajor: '', educationGraduationYear: 0,
    specialSkills: '', workHistoryText: '',
  }
  // Called with plain string URLs by every real caller, but at least one
  // transitive effect (ThaiAddressFields' province/district/subdistrict
  // fetches, mounted twice per page here) can fire this mock with an
  // undefined first arg during a render/cleanup race in jsdom — harmless in
  // real usage (apiJson is always called with a literal template string
  // there), so the mock defensively coerces rather than crashing on it.
  const mockApiJson = vi.fn((...allArgs: unknown[]) => {
    const url = String(allArgs[0] ?? '')
    if (url.includes('/profile')) return Promise.resolve({ ok: true, data: { profile: profileFixture }, status: 200 })
    if (url.includes('/thai-address/provinces')) return Promise.resolve({ ok: true, data: { provinces: [] }, status: 200 })
    if (url.includes('/thai-address/districts')) return Promise.resolve({ ok: true, data: { districts: [] }, status: 200 })
    if (url.includes('/thai-address/subdistricts')) return Promise.resolve({ ok: true, data: { subdistricts: [] }, status: 200 })
    return Promise.resolve({ ok: true, data: {}, status: 200 })
  })
  return { mockApiJson, profileFixture }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: mockApiJson,
  apiErrorMessage: () => 'error',
}))

import EmployeeProfileTab from '@/components/employees/EmployeeProfileTab'

afterEach(() => cleanup())
beforeEach(() => mockApiJson.mockClear())

/**
 * HR-editable employee-fields batch (2026-09-22) — blood group, parents/
 * siblings summary, highest education, special skills, prior work history.
 * Self-editable (no new gate), same component/tab used by both
 * EmployeeEditClient.tsx (HR) and ProfileClient.tsx (self-service).
 */
describe('EmployeeProfileTab — HR-editable employee-fields batch', () => {
  it('renders the new "ข้อมูลเพิ่มเติม" section and saves all 13 fields on submit', async () => {
    render(<EmployeeProfileTab employeeId="u1" active />)

    await screen.findByText('ข้อมูลเพิ่มเติม')

    fireEvent.change(screen.getByLabelText('กรุ๊ปเลือด'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('ชื่อบิดา'), { target: { value: 'สมชาย' } })
    fireEvent.change(screen.getByLabelText('อาชีพบิดา'), { target: { value: 'ค้าขาย' } })
    fireEvent.change(screen.getByLabelText('ชื่อมารดา'), { target: { value: 'สมหญิง' } })
    fireEvent.change(screen.getByLabelText('อาชีพมารดา'), { target: { value: 'รับราชการ' } })
    fireEvent.change(screen.getByLabelText('จำนวนพี่น้องทั้งหมด'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('เป็นบุตรคนที่'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('วุฒิการศึกษา'), { target: { value: 'BACHELOR' } })
    fireEvent.change(screen.getByLabelText('สถาบันการศึกษา'), { target: { value: 'มหาวิทยาลัยทดสอบ' } })
    fireEvent.change(screen.getByLabelText('สาขาวิชา'), { target: { value: 'รัฐศาสตร์' } })
    fireEvent.change(screen.getByLabelText('ปีที่จบการศึกษา'), { target: { value: '2560' } })
    fireEvent.change(screen.getByLabelText('ความสามารถพิเศษ'), { target: { value: 'พิมพ์ดีด' } })
    fireEvent.change(screen.getByLabelText('ประวัติการทำงาน (ที่เคยทำมาก่อน)'), { target: { value: 'บริษัท ABC (2563-2565)' } })

    fireEvent.click(screen.getByRole('button', { name: /บันทึกข้อมูลส่วนตัวเพิ่มเติม/ }))

    await waitFor(() => {
      const putCall = mockApiJson.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
      expect(putCall).toBeTruthy()
      const body = JSON.parse((putCall![1] as RequestInit).body as string)
      expect(body.bloodType).toBe('A')
      expect(body.fatherName).toBe('สมชาย')
      expect(body.fatherOccupation).toBe('ค้าขาย')
      expect(body.motherName).toBe('สมหญิง')
      expect(body.motherOccupation).toBe('รับราชการ')
      expect(body.siblingsTotal).toBe(3)
      expect(body.siblingsOrder).toBe(1)
      expect(body.educationLevel).toBe('BACHELOR')
      expect(body.educationInstitution).toBe('มหาวิทยาลัยทดสอบ')
      expect(body.educationMajor).toBe('รัฐศาสตร์')
      expect(body.educationGraduationYear).toBe(2560)
      expect(body.specialSkills).toBe('พิมพ์ดีด')
      expect(body.workHistoryText).toBe('บริษัท ABC (2563-2565)')
    })
  })

  it('loads existing values for the new fields from the profile GET response', async () => {
    mockApiJson.mockImplementation((...allArgs: unknown[]) => {
      const url = String(allArgs[0] ?? '')
      if (url.includes('/profile')) {
        return Promise.resolve({
          ok: true,
          data: { profile: { ...profileFixture, bloodType: 'O', specialSkills: 'ขับรถ' } },
          status: 200,
        })
      }
      return Promise.resolve({ ok: true, data: {}, status: 200 })
    })

    render(<EmployeeProfileTab employeeId="u2" active />)

    const bloodTypeSelect = (await screen.findByLabelText('กรุ๊ปเลือด')) as HTMLSelectElement
    expect(bloodTypeSelect.value).toBe('O')
    const skillsInput = screen.getByLabelText('ความสามารถพิเศษ') as HTMLTextAreaElement
    expect(skillsInput.value).toBe('ขับรถ')
  })
})
