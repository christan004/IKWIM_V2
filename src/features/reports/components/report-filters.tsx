import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * The date range every report shares, plus whatever extra filters a given
 * report supports.
 *
 * The extras are passed as children rather than props: the two central-stock
 * reports accept only `itemId`, while the order reports accept five filters, so
 * the bar carries what each page gives it instead of hiding controls that would
 * silently do nothing.
 */
export function ReportFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  children,
}: {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onReset: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="startDate" className="text-xs">
          From
        </Label>
        <Input
          id="startDate"
          type="date"
          className="h-9 w-40"
          value={startDate}
          max={endDate || undefined}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="endDate" className="text-xs">
          To
        </Label>
        <Input
          id="endDate"
          type="date"
          className="h-9 w-40"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
      </div>

      {children}

      <Button variant="ghost" size="sm" onClick={onReset} className="ml-auto">
        <RotateCcw className="size-3.5" />
        Reset
      </Button>
    </div>
  )
}
