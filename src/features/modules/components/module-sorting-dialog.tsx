import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage } from '@/lib/error-message'
import { useChangeModuleSorting, type ModuleRow } from '@/features/modules/use-modules'

/** A group of siblings — one level under one parent, which is what reorders together. */
interface SiblingGroup {
  /** `null` for the top level. */
  parentId: string | null
  label: string
  rows: ModuleRow[]
}

const LEVEL_LABEL: Record<string, string> = {
  module: 'Module',
  service: 'Service',
  feature: 'Feature',
}

/**
 * Reordering is **per level**: siblings compete only with each other, so a
 * module, its service and its feature can all be `1`. This groups rows by their
 * parent and reorders one group at a time.
 */
function toGroups(rows: ModuleRow[]): SiblingGroup[] {
  const byParent = new Map<string | null, ModuleRow[]>()
  for (const row of rows) {
    const key = row.parentId
    const list = byParent.get(key)
    if (list) list.push(row)
    else byParent.set(key, [row])
  }

  const groups: SiblingGroup[] = []
  for (const [parentId, siblings] of byParent) {
    // A single child has nothing to reorder against.
    if (siblings.length < 2) continue
    const first = siblings[0]
    groups.push({
      parentId,
      label: parentId
        ? `${first.parentName} — ${LEVEL_LABEL[first.level] ?? first.level}s`
        : 'Top level — Modules',
      rows: siblings,
    })
  }

  // Top level first, then alphabetically, so the list is predictable.
  return groups.sort((a, b) => {
    if (a.parentId === null) return -1
    if (b.parentId === null) return 1
    return a.label.localeCompare(b.label)
  })
}

export function ModuleSortingDialog({
  open,
  onOpenChange,
  rows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every module row, flattened — the same rows the table renders. */
  rows: ModuleRow[]
}) {
  const changeSorting = useChangeModuleSorting()
  const groups = useMemo(() => toGroups(rows), [rows])

  const [groupKey, setGroupKey] = useState<string>('')
  /** The working order, held locally until saved. */
  const [ordered, setOrdered] = useState<ModuleRow[]>([])

  const activeGroup = groups.find((g) => (g.parentId ?? 'root') === groupKey)

  useEffect(() => {
    if (!open) return
    // Default to the first group so the dialog opens on something actionable.
    const first = groups[0]
    setGroupKey(first ? (first.parentId ?? 'root') : '')
  }, [open, groups])

  useEffect(() => {
    setOrdered(activeGroup ? [...activeGroup.rows] : [])
  }, [activeGroup])

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    const next = [...ordered]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrdered(next)
  }

  /** True once the working order differs from what the server holds. */
  const isDirty =
    activeGroup !== undefined &&
    ordered.some((row, index) => row.id !== activeGroup.rows[index]?.id)

  function handleSave() {
    // The whole level is sent, so its numbers stay contiguous. 1-based: the API
    // rejects 0 with "Too small".
    const entries = ordered.map((row, index) => ({
      categoryId: row.id,
      sortingNumber: index + 1,
    }))

    changeSorting.mutate(entries, {
      onSuccess: () => {
        toast.success(`Order saved — ${entries.length} items renumbered`)
        onOpenChange(false)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reorder modules"
      description="Sorting applies within a level — siblings are numbered against each other, so a module, its service and its feature can each be 1."
    >
      <div className="grid gap-4">
        {groups.length === 0 ? (
          <p className="rounded-md border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing to reorder — no level has more than one item.
          </p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="group">Level</Label>
              <Select value={groupKey} onValueChange={setGroupKey}>
                <SelectTrigger id="group">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.parentId ?? 'root'} value={group.parentId ?? 'root'}>
                      {group.label} ({group.rows.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only these siblings are renumbered — other levels are untouched.
              </p>
            </div>

            <ul className="divide-y rounded-md border">
              {ordered.map((row, index) => (
                <li key={row.id} className="flex items-center gap-2 px-2 py-2">
                  <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                  {/* The number each row will be saved as, so the outcome is
                      visible before saving rather than inferred from position. */}
                  <Badge variant="secondary" className="w-7 shrink-0 justify-center tabular-nums">
                    {index + 1}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {row.code}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${row.name} up`}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === ordered.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${row.name} down`}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <DialogFooter>
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOrdered(activeGroup ? [...activeGroup.rows] : [])}
              disabled={changeSorting.isPending}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Saving an unchanged order would renumber for no reason. */}
          <Button type="button" onClick={handleSave} disabled={!isDirty || changeSorting.isPending}>
            {changeSorting.isPending ? 'Saving…' : 'Save order'}
          </Button>
        </DialogFooter>
      </div>
    </FormDialog>
  )
}
