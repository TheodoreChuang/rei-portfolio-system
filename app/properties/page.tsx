'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { Property, Entity } from '@/db/schema'

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEntityId, setNewEntityId] = useState('')
  const [availableEntities, setAvailableEntities] = useState<Entity[]>([])

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => toast.error('Failed to load properties'))
      .finally(() => setLoading(false))
    fetch('/api/entities')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAvailableEntities(data.entities ?? []) })
      .catch(() => {})
  }, [])

  async function addProperty() {
    if (!newAddress.trim() || !newStartDate) return
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: newAddress.trim(),
        nickname: newNickname.trim() || null,
        startDate: newStartDate,
        entityId: newEntityId || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to add property')
      return
    }
    const { property } = await res.json()
    setProperties(prev => [...prev, property])
    setNewAddress(''); setNewNickname(''); setNewStartDate(''); setNewEntityId(''); setShowAdd(false)
    toast.success('Property added')
  }

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-2xl">Properties</h1>
          <Button onClick={() => setShowAdd(v => !v)} size="sm">+ Add property</Button>
        </div>

        {showAdd && (
          <Card className="border-dashed bg-screen-bg mb-4">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold text-muted mb-3 tracking-wide uppercase">New property</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="addr">Full address</Label>
                  <Input id="addr" placeholder="123 Smith St, Sydney NSW 2000" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nick">Nickname <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="nick" placeholder="e.g. Smith St" value={newNickname} onChange={e => setNewNickname(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Acquisition date</Label>
                  <Input id="start-date" type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                </div>
                {availableEntities.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-entity">Entity <span className="font-normal text-muted">(optional)</span></Label>
                    <select id="prop-entity" value={newEntityId} onChange={e => setNewEntityId(e.target.value)}
                      className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white text-ink">
                      <option value="">None</option>
                      {availableEntities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={addProperty} disabled={!newAddress.trim() || !newStartDate}>Add property</Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card>
            <div className="px-5 py-6 text-center text-sm text-muted">Loading properties…</div>
          </Card>
        ) : (
        <Card>
          <div className="px-5 py-3 border-b border-border">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Your properties ({properties.length})</span>
          </div>
          {properties.map((p, _i) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 border-b border-ruled last:border-b-0">
              <div className="w-9 h-9 rounded-md bg-screen-bg border border-border flex items-center justify-center text-base flex-shrink-0">🏠</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.address}</p>
                {p.nickname && <p className="text-[11px] text-muted font-mono mt-0.5">"{p.nickname}"</p>}
              </div>
              <Link href={`/properties/${p.id}`}>
                <Button variant="outline" size="sm">Edit</Button>
              </Link>
            </div>
          ))}
        </Card>
        )}

        <p className="text-xs text-muted mt-4 leading-relaxed">
          Mortgage amounts are entered per-month when you generate a report.
        </p>
      </div>
    </div>
  )
}
