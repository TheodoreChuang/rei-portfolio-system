'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [showExpiredBanner, setShowExpiredBanner] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'expired') {
      setShowExpiredBanner(true)
    }
  }, [])

  async function handleSend() {
    if (!email) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setSent(true)
    toast.success('Magic link sent — check your inbox')
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-screen-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="font-serif text-2xl text-center mb-7">Folio</div>
          <Card>
            <CardContent className="pt-7 pb-7 text-center">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="text-lg font-semibold mb-2">Check your inbox</h2>
              <p className="text-sm text-muted leading-relaxed">
                We sent a magic link to<br />
                <strong className="text-ink">{email}</strong><br /><br />
                Click the link to log in — no password needed.
              </p>
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-sm text-muted">
                  Didn't get it?{' '}
                  <Button variant="link" className="p-0 h-auto" onClick={() => setSent(false)}>
                    Resend email
                  </Button>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-screen-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="font-serif text-2xl text-center mb-7">Folio</div>

        {showExpiredBanner && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn-light px-4 py-3 text-sm text-[#7a3a1a]">
            <span className="flex-shrink-0">⚠️</span>
            <span className="flex-1">Your session expired — please sign in again.</span>
            <button
              onClick={() => setShowExpiredBanner(false)}
              className="flex-shrink-0 text-[#7a3a1a] hover:opacity-70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <Card>
          <CardContent className="pt-7 pb-7">
            <h2 className="text-lg font-semibold mb-1">Welcome back</h2>
            <p className="text-sm text-muted mb-6">Enter your email to get a login link.</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
              </div>
              <Button className="w-full" onClick={handleSend} disabled={!email || loading}>
                {loading ? 'Sending…' : 'Send login link →'}
              </Button>
            </div>
            <p className="text-center text-sm text-muted mt-5">
              New here?{' '}
              <Link href="/signup" className="text-accent font-medium hover:underline">Create an account</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
