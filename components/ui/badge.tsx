import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-ink text-white',
        green:    'bg-green-100 text-green-800',
        orange:   'bg-warn-light text-warn',
        grey:     'bg-screen-bg text-muted border border-border',
        blue:     'bg-blue-50 text-blue-700',
        outline:  'border border-border text-ink bg-transparent',
      },
    },
    defaultVariants: { variant: 'grey' },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
