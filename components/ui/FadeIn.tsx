import { cn } from '@/lib/utils'

type Props = {
  children: React.ReactNode
  className?: string
  delay?: number
}

export default function FadeIn({ children, className, delay = 0 }: Props) {
  return (
    <div
      className={cn('animate-fade-in-sm opacity-0', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'forwards',
      }}
    >
      {children}
    </div>
  )
}
