'use client'

import dynamic from 'next/dynamic'
import type { Props } from './OutsideWorkExcelForm'
import OutsideWorkSkeleton from './OutsideWorkSkeleton'

const OutsideWorkExcelForm = dynamic(() => import('./OutsideWorkExcelForm'), {
  loading: () => <OutsideWorkSkeleton />,
})

export type { OWRequest } from './OutsideWorkExcelForm'

export default function OutsideWorkClient(props: Props) {
  return <OutsideWorkExcelForm {...props} />
}
