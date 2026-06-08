/** สาขามาตรฐาน — เค เอ็ม เซอร์วิสพลัส จำกัด */
export const HQ_BRANCH_ID = 'branch-hq-kmsp'
export const NMA_BRANCH_ID = 'branch-nma-korat'

export type CompanyBranchSeed = {
  id: string
  code: string
  name: string
  nameEn: string
  address: string
  isDefault: boolean
  /** ข้อความแสดงในฟอร์มสมัคร เช่น สาขาหลัก */
  registerTag: string
  /** พิกัด geofence (ค่าประมาณ — HR ควรปรับใน Admin > จัดการสาขา) */
  lat?: number
  lng?: number
  radiusMeters?: number
}

export const DEFAULT_COMPANY_BRANCHES: CompanyBranchSeed[] = [
  {
    id: HQ_BRANCH_ID,
    code: 'HQ',
    name: 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด',
    nameEn: 'KM Service Plus Co., Ltd.',
    address: '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
    isDefault: true,
    registerTag: 'สาขาหลัก',
    lat: 13.8511,
    lng: 100.6596,
    radiusMeters: 100,
  },
  {
    id: NMA_BRANCH_ID,
    code: 'NMA',
    name: 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด สาขานครราชสีมา',
    nameEn: 'KM Service Plus Co., Ltd. — Nakhon Ratchasima',
    address: '233/7 หมู่บ้านนีโอพาร์ค หนองกระทุ่ม อำเภอเมืองนครราชสีมา นครราชสีมา 30000',
    isDefault: false,
    registerTag: 'สาขาย่อย',
    lat: 14.9796,
    lng: 102.0978,
    radiusMeters: 100,
  },
]

export function registerBranchLabel(name: string, tag?: string | null) {
  return tag ? `${name} (${tag})` : name
}
