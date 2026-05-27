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
}

export const DEFAULT_COMPANY_BRANCHES: CompanyBranchSeed[] = [
  {
    id: HQ_BRANCH_ID,
    code: 'HQ',
    name: 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด',
    nameEn: 'KM Service Plus Co., Ltd.',
    address: 'สาขาหลัก',
    isDefault: true,
    registerTag: 'สาขาหลัก',
  },
  {
    id: NMA_BRANCH_ID,
    code: 'NMA',
    name: 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด สาขานครราชสีมา',
    nameEn: 'KM Service Plus Co., Ltd. — Nakhon Ratchasima',
    address: 'จังหวัดนครราชสีมา',
    isDefault: false,
    registerTag: 'สาขาย่อย',
  },
]

export function registerBranchLabel(name: string, tag?: string | null) {
  return tag ? `${name} (${tag})` : name
}
