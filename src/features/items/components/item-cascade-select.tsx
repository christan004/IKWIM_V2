import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ItemRow } from '@/features/items/use-items'

/**
 * The item tree is three levels deep, and each level means something different:
 *
 *   depth 0 — Class     (Fuel)
 *   depth 1 — Item      (Petrol)
 *   depth 2 — Category  (PMS)
 *
 * Only the **Category** is ordered against, so this renders one select per
 * level and reports the leaf. A single flat list would make the user scan for a
 * name whose meaning depends on its ancestors — "PMS" alone says little.
 */
const LEVEL_LABELS = ['Class', 'Item', 'Category'] as const

export function ItemCascadeSelect({
  rows,
  value,
  onChange,
  error,
  disabled,
}: {
  /** Every item, flattened — the same rows the Items table renders. */
  rows: ItemRow[]
  /** The selected leaf id, or '' when nothing is chosen. */
  value: string
  onChange: (itemId: string) => void
  error?: string
  disabled?: boolean
}) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  /**
   * The chain of ancestors for the selected leaf, so reopening the form shows
   * the same path the user picked rather than three empty selects.
   */
  const selectedPath = useMemo(() => {
    const path: string[] = []
    let current = value ? byId.get(value) : undefined
    while (current) {
      path.unshift(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return path
  }, [value, byId])

  // One entry per level: the id chosen at that depth.
  const [path, setPath] = useState<string[]>(selectedPath)

  useEffect(() => {
    setPath(selectedPath)
  }, [selectedPath])

  /** Options at `depth`, given what was chosen above it. */
  function optionsAt(depth: number): ItemRow[] {
    if (depth === 0) return rows.filter((r) => r.depth === 0)
    const parentId = path[depth - 1]
    if (!parentId) return []
    return rows.filter((r) => r.parentId === parentId)
  }

  function handleSelect(depth: number, id: string) {
    // Choosing at one level invalidates everything below it.
    const next = [...path.slice(0, depth), id]
    setPath(next)

    // Only a leaf is a valid order target; a branch clears the selection until
    // the user drills down to one.
    const chosen = byId.get(id)
    onChange(chosen && chosen.childCount === 0 ? id : '')
  }

  // A level is shown only when the choice above it actually has children — an
  // item with no sub-levels (a Class that is itself orderable) stops here
  // rather than showing an empty "Item" select the user cannot satisfy.
  const levels = LEVEL_LABELS.map((label, depth) => ({
    label,
    depth,
    options: optionsAt(depth),
  })).filter((level) => level.depth === 0 || level.options.length > 0)

  const selectedLeaf = value ? byId.get(value) : undefined
  const deepestChosen = path.length ? byId.get(path[path.length - 1]) : undefined
  const needsDrillDown = Boolean(deepestChosen && deepestChosen.childCount > 0 && !selectedLeaf)

  return (
    <div className="grid gap-2">
      {levels.map((level) => (
        <div key={level.label} className="grid gap-1.5">
          <Label htmlFor={`item-level-${level.depth}`}>{level.label}</Label>
          <Select
            value={path[level.depth] ?? ''}
            disabled={disabled}
            onValueChange={(id) => handleSelect(level.depth, id)}
          >
            <SelectTrigger id={`item-level-${level.depth}`}>
              <SelectValue placeholder={`Select a ${level.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {level.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : needsDrillDown ? (
        <p className="text-xs text-muted-foreground">
          &ldquo;{deepestChosen?.name}&rdquo; groups other items — keep drilling down to
          the one being ordered.
        </p>
      ) : selectedLeaf ? (
        <p className="text-xs text-muted-foreground">
          Ordering <span className="font-medium text-foreground">{selectedLeaf.name}</span>.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Choose the item being ordered. Groups expand into the level below.
        </p>
      )}
    </div>
  )
}
