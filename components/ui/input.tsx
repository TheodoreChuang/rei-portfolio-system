import * as React from 'react'
import { cn } from '@/lib/utils'

// React 19: plain function, no forwardRef, data-slot for shadcn targeting
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-sans',
        'placeholder:text-muted/60',
        'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-light',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Input }
