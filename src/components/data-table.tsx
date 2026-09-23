import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, SearchX, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

type StatusFilter = 'all' | 'active' | 'inactive'

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[] | undefined
  rowKey: (row: T) => string
  isLoading?: boolean
  emptyMessage?: string
  /** Enables the search box; returns the text to match the query against for a row. */
  getSearchText?: (row: T) => string
  searchPlaceholder?: string
  /** Enables the Active/Inactive filter chips. */
  getIsActive?: (row: T) => boolean
  /** Rows per page. Defaults to 10; pass 0 to disable pagination. */
  pageSize?: number
  /**
   * Optional detail panel shown beneath a row when it is clicked. Return
   * `null` for rows with nothing to reveal — those stay non-clickable.
   *
   * One row is open at a time, which keeps a long table readable.
   */
  renderExpanded?: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  emptyMessage = 'No records yet.',
  getSearchText,
  searchPlaceholder = 'Search…',
  getIsActive,
  pageSize = 10,
  renderExpanded,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  /** The one open row, by key. Null when nothing is expanded. */
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!data) return data
    let rows = data
    if (getIsActive && statusFilter !== 'all') {
      rows = rows.filter((row) => getIsActive(row) === (statusFilter === 'active'))
    }
    if (getSearchText && query.trim()) {
      const q = query.trim().toLowerCase()
      rows = rows.filter((row) => getSearchText(row).toLowerCase().includes(q))
    }
    return rows
  }, [data, query, statusFilter, getSearchText, getIsActive])

  useEffect(() => {
    setPage(1)
    // An open panel would otherwise linger against a row that filtering has
    // moved or removed.
    setExpandedKey(null)
  }, [query, statusFilter])

  // Likewise when paging away from the open row.
  useEffect(() => {
    setExpandedKey(null)
  }, [page])

  const paginationEnabled = pageSize > 0
  const totalCount = filtered?.length ?? 0
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1
  const currentPage = Math.min(page, totalPages)
  const paged = useMemo(() => {
    if (!filtered || !paginationEnabled) return filtered
    return filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [filtered, paginationEnabled, currentPage, pageSize])

  const showToolbar = !!getSearchText || !!getIsActive

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {getSearchText && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-8"
              />
            </div>
          )}
          {getIsActive && (
            <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
              {(['all', 'active', 'inactive'] as StatusFilter[]).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatusFilter(option)}
                  className={cn(
                    'h-7 rounded-sm px-2.5 text-xs capitalize',
                    statusFilter === option && 'bg-background shadow-sm',
                  )}
                >
                  {option}
                </Button>
              ))}
            </div>
          )}
          {(query || statusFilter !== 'all') && data && (
            <span className="text-xs text-muted-foreground">
              {filtered?.length ?? 0} of {data.length}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.header} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : !paged || paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-1.5">
                    {data && data.length > 0 ? (
                      <>
                        <SearchX className="size-5 opacity-50" />
                        <span>No matching records.</span>
                      </>
                    ) : (
                      <span>{emptyMessage}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => {
                const key = rowKey(row)
                const detail = renderExpanded?.(row)
                const isExpanded = expandedKey === key && detail != null

                return (
                  <Fragment key={key}>
                    <TableRow
                      // Only clickable when the row actually has something to
                      // reveal, so a plain table keeps its normal cursor.
                      className={cn(detail != null && 'cursor-pointer')}
                      onClick={
                        detail != null
                          ? () => setExpandedKey(isExpanded ? null : key)
                          : undefined
                      }
                    >
                      {columns.map((col) => (
                        <TableCell key={col.header} className={col.className}>
                          {col.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columns.length} className="bg-muted/30 p-0">
                          {detail}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {paginationEnabled && totalCount > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} ({totalCount} {totalCount === 1 ? 'record' : 'records'})
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
