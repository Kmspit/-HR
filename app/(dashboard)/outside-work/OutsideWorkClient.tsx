'use client'

import OutsideWorkExcelForm, { type OWRequest, type Props } from './OutsideWorkExcelForm'

export type { OWRequest }

export default function OutsideWorkClient(props: Props) {
  return <OutsideWorkExcelForm {...props} />
}
