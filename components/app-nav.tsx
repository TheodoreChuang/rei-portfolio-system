'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/dashboard',  label: 'Reports' },
  { href: '/upload',     label: 'Upload' },
  { href: '/properties', label: 'Properties' },
]

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav className="bg-white border-b border-border flex items-center justify-between px-6 min-h-[52px]">
      <Link href="/" className="font-serif text-xl text-ink">PropFlow</Link>
      <div className="flex gap-1">
        {links.map(l => (
          <Link key={l.href} href={l.href} className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            pathname.startsWith(l.href)
              ? 'bg-accent-light text-accent'
              : 'text-muted hover:text-ink hover:bg-screen-bg'
          )}>{l.label}</Link>
        ))}
      </div>
      <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-white text-xs font-semibold select-none">
        JD
      </div>
    </nav>
  )
}
