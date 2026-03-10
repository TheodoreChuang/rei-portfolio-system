'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Property } from '@/db/schema'

export default function OnboardingPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')
  const [startDate, setStartDate] = useState('')
  const [showForm, setShowForm] = useState(true)

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(data => {
        const existing: Property[] = data.properties ?? []
        setProperties(existing)
        if (existing.length > 0) setShowForm(false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function addProperty() {
    if (!address.trim() || !startDate) return
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim(), nickname: nickname.trim() || null, startDate }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to add property')
      return
    }
    const { property } = await res.json()
    setProperties(prev => [...prev, property])
    setAddress('')
    setNickname('')
    setStartDate('')
    setShowForm(false)
    toast.success('Property added')
  }

  return (
    <div className="min-h-screen bg-screen-bg">
      <nav className="bg-white border-b border-border flex items-center justify-between px-6 h-[52px]">
        <span className="font-serif text-xl text-ink">PropFlow</span>
        <span className="text-sm text-muted">Step 1 of 2</span>
      </nav>

      {/* Step progress */}
      <div className="flex border-b border-border">
        {[
          { n: 1, label: 'Add properties', active: true },
          { n: 2, label: 'Upload statements', active: false },
        ].map((s) => (
          <div
            key={s.n}
            className={`flex-1 py-2.5 px-4 text-xs flex items-center gap-2 border-r border-border last:border-r-0 ${
              s.active ? 'bg-white font-semibold text-ink' : 'text-muted'
            }`}
          >
            <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
              s.active ? 'bg-ink text-white' : 'bg-border text-muted'
            }`}>{s.n}</span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">
          {properties.length === 0 ? 'Add your properties' : 'Your properties'}
        </h1>
        <p className="text-sm text-muted mb-6">
          {properties.length === 0
            ? 'Add each investment property. You can edit these later.'
            : `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} added.`}
        </p>

        {/* Existing properties */}
        {properties.length > 0 && (
          <div className="space-y-2 mb-4">
            {properties.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{p.address}</div>
                    {p.nickname && (
                      <div className="text-xs text-muted mt-0.5">"{p.nickname}"</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted hover:text-warn"
                    onClick={async () => {
                      const res = await fetch(`/api/properties/${p.id}`, { method: 'DELETE' })
                      if (!res.ok) {
                        toast.error('Failed to remove property')
                        return
                      }
                      setProperties((prev) => prev.filter((x) => x.id !== p.id))
                    }}
                  >
                    Remove
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add form */}
        {showForm ? (
          <Card className="border-dashed bg-screen-bg">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold text-muted mb-3 tracking-wide uppercase">New property</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="address">Full address</Label>
                  <Input
                    id="address"
                    placeholder="123 Smith St, Sydney NSW 2000"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nickname">
                    Nickname <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="nickname"
                    placeholder="e.g. Smith St"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Acquisition date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addProperty()}
                  />
                </div>
                <Button className="w-full" onClick={addProperty} disabled={!address.trim() || !startDate}>
                  Add property
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full border border-dashed border-border rounded-lg p-4 text-center text-sm text-muted hover:border-accent hover:text-accent transition-colors bg-screen-bg"
          >
            <span className="text-lg block mb-1">+</span>
            Add another property
          </button>
        )}

        {properties.length > 0 && (
          <>
            <Separator className="my-4" />
            <Button className="w-full" size="lg" onClick={() => router.push('/upload')}>
              Continue to upload →
            </Button>
          </>
        )}

        <p className="text-center text-xs text-muted mt-4">
          <Button variant="link" size="sm" className="p-0 h-auto text-accent" onClick={() => router.push('/upload')}>
            Skip for now — add properties later
          </Button>
        </p>
      </div>
    </div>
  )
}
