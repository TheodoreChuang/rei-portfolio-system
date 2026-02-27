'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard',  label: 'Reports' },
  { href: '/upload',     label: 'Upload' },
  { href: '/properties', label: 'Properties' },
]

function getInitials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

export function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = email ? getInitials(email) : '…'

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

      <div className="relative" ref={dropdownRef}>
        <button
          data-testid="user-avatar"
          onClick={() => setOpen(v => !v)}
          className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-white text-xs font-semibold select-none hover:bg-ink/80 transition-colors"
          aria-label="User menu"
          aria-expanded={open}
        >
          {initials}
        </button>

        {open && (
          <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-border bg-white shadow-md py-1">
            {email && (
              <div className="px-3 py-2 text-xs text-muted truncate border-b border-border mb-1">
                {email}
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-screen-bg transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
