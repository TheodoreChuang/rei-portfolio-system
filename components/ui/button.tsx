import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium',
    'cursor-pointer transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent] focus-visible:ring-offset-1',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[slot=button]:*:[svg]:pointer-events-none data-[slot=button]:*:[svg]:size-4 data-[slot=button]:*:[svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:     'bg-ink text-white hover:bg-ink/90',
        secondary:   'bg-screen-bg text-ink border border-border hover:bg-ruled',
        outline:     'border border-border bg-white text-ink hover:bg-screen-bg hover:border-ink',
        ghost:       'text-muted hover:text-ink hover:bg-screen-bg',
        destructive: 'bg-warn-light text-warn border border-warn/40 hover:bg-warn/10',
        link:        'text-accent underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3 text-xs',
        lg:      'h-11 px-6 text-base',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

// React 19: forwardRef removed. ref is a plain prop on all components.
// data-slot added for shadcn's CSS targeting API.
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
