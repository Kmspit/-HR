/** ชื่อบริษัทและสำนักงาน — ใช้ทั้งระบบ */
export const COMPANY_NAME_TH = 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด'
export const COMPANY_NAME_SHORT = 'เค เอ็ม เซอร์วิส พลัส'
export const COMPANY_NAME_EN = 'KM Service Plus Co., Ltd.'
export const COMPANY_LOGO_BADGE = 'จำกัด'

/** ค่าเริ่มต้นสำนักงาน — เช็คอินในบริษัท */
export const KM_COMPANY = {
  companyName: COMPANY_NAME_TH,
  companyNameEn: COMPANY_NAME_EN,
  officeAddress:
    '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
  geofenceLat: 13.82965,
  geofenceLng: 100.67712,
  geofenceRadius: 200,
} as const
