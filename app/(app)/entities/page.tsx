'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Entity, EntityType, Property } from '@/db/schema'

// ── Constants ──────────────────────────────────────────────────────────────

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'individual',     label: 'Individual' },
  { value: 'joint',          label: 'Joint' },
  { value: 'trust',          label: 'Discretionary trust' },
  { value: 'company',        label: 'Company' },
  { value: 'superannuation', label: 'Super' },
]

function typeLabel(type: EntityType): string {
  return ENTITY_TYPES.find(t => t.value === type)?.label ?? type
}

function formatCreatedAt(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

// ── Types ──────────────────────────────────────────────────────────────────

type CardState =
  | { mode: 'default' }
  | { mode: 'renaming'; draftName: string }
  | { mode: 'confirming-delete' }

// ── Add entity inline form ─────────────────────────────────────────────────

function AddEntityForm({
  onAdd,
  onCancel,
}: {
  onAdd: (entity: Entity) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('individual')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, type }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add entity')
        return
      }
      const { entity } = await res.json() as { entity: Entity }
      onAdd(entity)
      toast.success('Entity added')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-6">
      <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">New entity</p>
      <div className="space-y-3">
        <div>
          <label htmlFor="new-entity-name" className="block text-xs font-medium text-ink mb-1">Name</label>
          <Input
            ref={inputRef}
            id="new-entity-name"
            placeholder="e.g. Smith Family Trust"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
        </div>
        <div>
          <label htmlFor="new-entity-type" className="block text-xs font-medium text-ink mb-1">Type</label>
          <select
            id="new-entity-type"
            value={type}
            onChange={e => setType(e.target.value as EntityType)}
            className="w-full h-9 border border-border rounded-md px-3 text-sm bg-white text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          >
            {ENTITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={submit}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Adding…' : 'Add entity'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ── Entity card ────────────────────────────────────────────────────────────

function EntityCard({
  entity,
  propCount,
  cardState,
  onStateChange,
  onRename,
  onDelete,
}: {
  entity: Entity
  propCount: number
  cardState: CardState
  onStateChange: (state: CardState) => void
  onRename: (id: string, newName: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const router = useRouter()
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const isRenaming = cardState.mode === 'renaming'
  const isConfirmingDelete = cardState.mode === 'confirming-delete'

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  function enterRename() {
    onStateChange({ mode: 'renaming', draftName: entity.name })
  }

  function cancelRename() {
    onStateChange({ mode: 'default' })
  }

  async function saveRename() {
    if (cardState.mode !== 'renaming') return
    const trimmed = cardState.draftName.trim()
    if (!trimmed || trimmed === entity.name) {
      cancelRename()
      return
    }
    setRenameLoading(true)
    try {
      await onRename(entity.id, trimmed)
      onStateChange({ mode: 'default' })
    } finally {
      setRenameLoading(false)
    }
  }

  async function confirmDelete() {
    setDeleteError(null)
    setDeleteLoading(true)
    try {
      await onDelete(entity.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete entity'
      setDeleteError(msg)
      setDeleteLoading(false)
    }
  }

  function enterDelete() {
    setDeleteError(null)
    onStateChange({ mode: 'confirming-delete' })
  }

  function cancelDelete() {
    setDeleteError(null)
    onStateChange({ mode: 'default' })
  }

  const created = formatCreatedAt(entity.createdAt)

  return (
    <article className={[
      'bg-surface border border-border rounded-lg',
      isConfirmingDelete ? 'border-negative/30 bg-negative-soft/20' : '',
    ].join(' ')}>

      {/* Main card body */}
      <div className="p-5 flex gap-4">
        {/* Left: info */}
        <div className="flex-1 min-w-0">

          {/* Name row — rename state or default */}
          {isRenaming && cardState.mode === 'renaming' ? (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Input
                ref={renameInputRef}
                value={cardState.draftName}
                onChange={e => onStateChange({ mode: 'renaming', draftName: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveRename()
                  if (e.key === 'Escape') cancelRename()
                }}
                className="h-8 text-sm flex-1 min-w-0"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelRename}
                disabled={renameLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveRename}
                disabled={renameLoading || !cardState.draftName.trim()}
              >
                {renameLoading ? 'Saving…' : 'Save rename'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h3
                className={[
                  'text-sm font-semibold text-ink leading-tight',
                  isConfirmingDelete ? 'cursor-default' : 'cursor-pointer hover:text-accent transition-colors',
                ].join(' ')}
                onClick={isConfirmingDelete ? undefined : enterRename}
                title={isConfirmingDelete ? undefined : 'Click to rename'}
              >
                {entity.name}
              </h3>
              {isConfirmingDelete && (
                <span className="text-[10px] font-semibold text-negative uppercase tracking-wider">About to delete</span>
              )}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-3 flex-wrap">
            <span>{typeLabel(entity.type)}</span>
            <span className="text-foreground-faint">·</span>
            <span>Created {created}</span>
          </div>

          {/* Rename impact warning */}
          {isRenaming && (
            <div className="flex items-start gap-2 text-xs text-foreground-muted bg-surface-sunken rounded-md px-3 py-2 mb-1">
              <span className="text-accent font-semibold text-[11px] mt-0.5 shrink-0">i</span>
              <span>
                Renaming will update{' '}
                <strong className="font-semibold text-ink">{propCount} {propCount === 1 ? 'property' : 'properties'}</strong>{' '}
                and references in transaction history. Historical statements remain unchanged.
              </span>
            </div>
          )}

          {/* Stats grid */}
          {!isRenaming && (
            <div className="grid grid-cols-3 gap-3">
              {/* Properties stat */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">Properties</span>
                <span className={['text-sm font-semibold', propCount === 0 ? 'text-foreground-muted' : 'text-ink'].join(' ')}>
                  {propCount === 0 ? '0' : propCount}
                </span>
                {propCount > 0 ? (
                  <button
                    onClick={() => router.push(`/properties?entity=${entity.id}`)}
                    className="text-[11px] text-accent hover:underline text-left"
                  >
                    View →
                  </button>
                ) : (
                  <span className="text-[11px] text-foreground-muted">—</span>
                )}
              </div>

              {/* Loans stat — no API, show — */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">Loans</span>
                <span className="text-sm font-semibold text-foreground-muted">—</span>
                <span className="text-[11px] text-foreground-muted">no data</span>
              </div>

              {/* Last activity — no API */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">Last activity</span>
                <span className="text-sm font-medium text-foreground-muted">never</span>
              </div>
            </div>
          )}
        </div>

        {/* Right rail: status badge + kebab */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant="complete" className="shrink-0">Active</Badge>

          {/* Kebab menu — disabled during rename */}
          {!isRenaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-muted hover:text-ink hover:bg-surface-sunken transition-colors text-lg leading-none"
                  aria-label="Entity actions"
                >
                  ⋯
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={enterRename}
                  className="gap-2 cursor-pointer"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M2 10L9 3l2 2-7 7H2v-2z"/>
                  </svg>
                  Rename…
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => toast.info('Archive not yet available')}
                  className="gap-2 cursor-pointer"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="2" y="4" width="10" height="8" rx="0.5"/>
                    <path d="M2 7h10M5 4V2.5h4V4"/>
                  </svg>
                  Archive
                </DropdownMenuItem>

                {/* Delete — disabled if entity has properties */}
                {propCount > 0 ? (
                  <div>
                    <DropdownMenuItem
                      disabled
                      className="gap-2 opacity-40 cursor-not-allowed"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M3 4h8l-1 8H4z"/>
                        <path d="M5 4V2h4v2"/>
                      </svg>
                      Delete
                    </DropdownMenuItem>
                    <p className="px-2 py-1 text-[11px] text-foreground-muted leading-snug">
                      Delete is disabled while this entity holds <strong className="font-semibold">{propCount} {propCount === 1 ? 'property' : 'properties'}</strong>. Move or remove the {propCount === 1 ? 'property' : 'properties'} first.
                    </p>
                  </div>
                ) : (
                  <DropdownMenuItem
                    onClick={enterDelete}
                    className="gap-2 cursor-pointer text-negative focus:text-negative focus:bg-negative-soft/40"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M3 4h8l-1 8H4z"/>
                      <path d="M5 4V2h4v2"/>
                    </svg>
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Kebab placeholder during rename (dimmed) */}
          {isRenaming && (
            <span
              className="w-7 h-7 flex items-center justify-center text-foreground-muted opacity-40 text-lg leading-none cursor-not-allowed"
              aria-hidden
            >
              ⋯
            </span>
          )}
        </div>
      </div>

      {/* Delete confirmation panel */}
      {isConfirmingDelete && (
        <div className="border-t border-negative/20 px-5 py-4 bg-negative-soft/30 rounded-b-lg">
          <p className="text-sm text-ink mb-3">
            <strong className="font-semibold">Delete this entity?</strong>{' '}
            No properties, loans, or transactions are attached — deletion is safe and permanent.
          </p>
          {deleteError && (
            <p className="text-xs text-negative mb-2 leading-snug">{deleteError}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelDelete}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-negative text-white hover:bg-negative/90 border-0"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/entities').then(r => r.json()) as Promise<{ entities?: Entity[] }>,
      fetch('/api/properties').then(r => r.json()) as Promise<{ properties?: Property[] }>,
    ])
      .then(([eData, pData]) => {
        setEntities(eData.entities ?? [])
        setProperties(pData.properties ?? [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  // Property count per entity (client-side join)
  const propCountByEntity = properties.reduce<Record<string, number>>((acc, p) => {
    if (p.entityId) acc[p.entityId] = (acc[p.entityId] ?? 0) + 1
    return acc
  }, {})

  function getCardState(id: string): CardState {
    return cardStates[id] ?? { mode: 'default' }
  }

  function setCardState(id: string, state: CardState) {
    setCardStates(prev => ({ ...prev, [id]: state }))
  }

  async function handleRename(id: string, newName: string) {
    const res = await fetch(`/api/entities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast.error(err.error ?? 'Failed to rename entity')
      throw new Error(err.error ?? 'Failed to rename entity')
    }
    const { entity } = await res.json() as { entity: Entity }
    setEntities(prev => prev.map(e => e.id === id ? entity : e))
    toast.success('Entity renamed')
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/entities/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      if (res.status === 409) {
        throw new Error(err.error ?? 'Cannot delete: entity has linked records')
      }
      toast.error(err.error ?? 'Failed to delete entity')
      throw new Error(err.error ?? 'Failed to delete entity')
    }
    setEntities(prev => prev.filter(e => e.id !== id))
    toast.success('Entity deleted')
  }

  function handleAddEntity(entity: Entity) {
    setEntities(prev => [...prev, entity])
    setShowAdd(false)
  }

  return (
    <div className="min-h-screen bg-screen-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Page head */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="font-serif text-2xl text-ink mb-1">Entities</h1>
            <p className="text-sm text-foreground-muted">
              Trusts, companies, and individuals that own property in Folio.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAdd(v => !v)}
            className="mt-1 shrink-0"
          >
            + Add entity
          </Button>
        </div>

        <div className="mt-6 space-y-6">

          {/* Add entity form */}
          {showAdd && (
            <AddEntityForm
              onAdd={handleAddEntity}
              onCancel={() => setShowAdd(false)}
            />
          )}

          {/* Active entities */}
          <div>
            {/* Section label */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest">
                Active · {loading ? '…' : entities.length}
              </span>
              {!loading && entities.length > 0 && (
                <span className="text-xs text-foreground-muted">
                  Click any name to rename it.
                </span>
              )}
            </div>

            {loading ? (
              <div className="bg-surface border border-border rounded-lg px-5 py-6 text-center text-sm text-foreground-muted">
                Loading…
              </div>
            ) : entities.length === 0 ? (
              <div className="bg-surface border border-border rounded-lg px-5 py-6 text-center text-sm text-foreground-muted">
                No entities yet. Add one with the button above.
              </div>
            ) : (
              <div className="space-y-3">
                {entities.map(entity => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    propCount={propCountByEntity[entity.id] ?? 0}
                    cardState={getCardState(entity.id)}
                    onStateChange={state => setCardState(entity.id, state)}
                    onRename={handleRename}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Safety footer */}
          <div className="space-y-3 text-sm text-foreground-muted leading-relaxed pt-2 border-t border-border">
            <p>
              <strong className="font-semibold text-ink">Renaming is safe.</strong>{' '}
              The new name appears everywhere — properties, loans, filter chips, transaction history — but the underlying records are untouched. Historical statements keep the name they were imported with.
            </p>
            <p>
              <strong className="font-semibold text-ink">Archive preserves history; delete is permanent.</strong>{' '}
              Archive hides an entity from pickers and filters but keeps every record. Delete is only available when nothing is attached — most often, when you&apos;ve just created an entity by mistake.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
