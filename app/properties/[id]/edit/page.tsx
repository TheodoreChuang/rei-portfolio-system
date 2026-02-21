'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { PROPERTIES } from '@/lib/mock-data'

export default function EditPropertyPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const prop = PROPERTIES.find(p => p.id === params.id) || PROPERTIES[1]
  const [address, setAddress] = useState(prop.address)
  const [nickname, setNickname] = useState(prop.nickname)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleSave() {
    toast.success('Property updated')
    router.push('/properties')
  }

  function handleDelete() {
    toast.success('Property deleted')
    router.push('/properties')
  }

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
                This will remove <strong>{prop.address}</strong> from your account.
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
