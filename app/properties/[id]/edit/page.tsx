'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import type { Property } from '@/db/schema'

export default function EditPropertyPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [originalAddress, setOriginalAddress] = useState('')
  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/properties/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(data => {
        if (!data) return
        const p: Property = data.property
        setAddress(p.address)
        setNickname(p.nickname ?? '')
        setOriginalAddress(p.address)
      })
      .catch(() => toast.error('Failed to load property'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    const res = await fetch(`/api/properties/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, nickname: nickname.trim() || null }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to update property')
      return
    }
    toast.success('Property updated')
    router.push('/properties')
  }

  async function handleDelete() {
    const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to delete property')
      return
    }
    toast.success('Property deleted')
    router.push('/properties')
  }

  if (loading) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8 text-center text-sm text-muted">Loading…</div>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-sm text-muted mb-4">Property not found.</p>
        <Button variant="outline" onClick={() => router.push('/properties')}>← Back to properties</Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6 text-muted" onClick={() => router.back()}>
          ← Back to properties
        </Button>

        <h1 className="font-serif text-2xl mb-1">Edit property</h1>
        <p className="text-sm text-muted mb-6">Changes take effect on future report generation.</p>

        <Card className="mb-4">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="address">Full address</Label>
              <Input id="address" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} />
            </div>
            <Separator />
            <div className="flex items-center gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave}>Save changes</Button>
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="text-[11px] text-muted leading-relaxed">
          <CardContent className="py-3">
            ⚠ Deleting a property does not delete historical statements. Past reports will retain the data as generated.
          </CardContent>
        </Card>

        {/* Delete confirmation — Radix Dialog handles focus trap, Escape key, aria */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete property?</DialogTitle>
              <DialogDescription>
                This will remove <strong>{originalAddress}</strong> from your account.
                Historical statements and reports are not affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                Delete property
              </Button>
              <DialogClose asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
