'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Entity, EntityType, Property } from '@/db/schema'

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'individual',    label: 'Individual' },
  { value: 'joint',         label: 'Joint' },
  { value: 'trust',         label: 'Trust' },
  { value: 'company',       label: 'Company' },
  { value: 'superannuation', label: 'Super' },
]

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<EntityType>('individual')
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/entities').then(r => r.json()),
      fetch('/api/properties').then(r => r.json()),
    ])
      .then(([eData, pData]) => {
        setEntities(eData.entities ?? [])
        setProperties(pData.properties ?? [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  async function addEntity() {
    if (!newName.trim()) return
    const res = await fetch('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to add entity')
      return
    }
    const { entity } = await res.json()
    setEntities(prev => [...prev, entity])
    setNewName(''); setShowAdd(false)
    toast.success('Entity added')
  }

  async function deleteEntity(id: string) {
    setDeleteErrors(prev => ({ ...prev, [id]: '' }))
    const res = await fetch(`/api/entities/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setDeleteErrors(prev => ({ ...prev, [id]: err.error ?? 'Cannot delete' }))
      } else {
        toast.error(err.error ?? 'Failed to delete entity')
      }
      return
    }
    setEntities(prev => prev.filter(e => e.id !== id))
    toast.success('Entity deleted')
  }

  const propCountByEntity = properties.reduce<Record<string, number>>((acc, p) => {
    if (p.entityId) acc[p.entityId] = (acc[p.entityId] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-2xl">Entities</h1>
          <Button onClick={() => setShowAdd(v => !v)} size="sm">+ Add entity</Button>
        </div>

        {showAdd && (
          <Card className="border-dashed bg-screen-bg mb-4">
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold text-muted mb-3 tracking-wide uppercase">New entity</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ename">Name</Label>
                  <Input id="ename" placeholder="e.g. Smith Family Trust" value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addEntity()} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etype">Type</Label>
                  <select id="etype" value={newType} onChange={e => setNewType(e.target.value as EntityType)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white text-ink">
                    {ENTITY_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={addEntity} disabled={!newName.trim()}>Add entity</Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card>
            <div className="px-5 py-6 text-center text-sm text-muted">Loading…</div>
          </Card>
        ) : entities.length === 0 ? (
          <Card>
            <div className="px-5 py-6 text-center text-sm text-muted">No entities yet.</div>
          </Card>
        ) : (
          <Card>
            <div className="px-5 py-3 border-b border-border">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Entities ({entities.length})</span>
            </div>
            {entities.map(e => {
              const typeLabel = ENTITY_TYPES.find(t => t.value === e.type)?.label ?? e.type
              const propCount = propCountByEntity[e.id] ?? 0
              const errMsg = deleteErrors[e.id]
              return (
                <div key={e.id} className="px-5 py-4 border-b border-ruled last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{e.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] font-mono">{typeLabel}</Badge>
                        {propCount > 0 && (
                          <span className="text-[11px] text-muted">{propCount} {propCount === 1 ? 'property' : 'properties'}</span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => deleteEntity(e.id)}>
                      Delete
                    </Button>
                  </div>
                  {errMsg && (
                    <p className="mt-2 text-xs text-warn leading-snug">{errMsg}</p>
                  )}
                </div>
              )
            })}
          </Card>
        )}

        <p className="text-xs text-muted mt-4 leading-relaxed">
          Entities represent legal ownership structures. Assign them to properties and loans to filter by entity on the dashboard.
        </p>
      </div>
    </div>
  )
}
