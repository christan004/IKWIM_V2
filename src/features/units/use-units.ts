import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unitsService } from '@/features/units/units.service'
import { invalidate } from '@/api/query-keys'
import type { UnitRequest } from '@/api/types'

export const unitsQueryKey = ['items', 'units'] as const

export function useUnits({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: unitsQueryKey,
    queryFn: unitsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    units: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useToggleUnitStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => unitsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'units'),
  })
}

export function useSaveUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...unit }: UnitRequest & { id?: string }) =>
      id ? unitsService.update(id, unit) : unitsService.create(unit),
    onSuccess: () => invalidate(queryClient, 'units'),
  })
}
