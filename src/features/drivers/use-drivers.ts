import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { driversService } from '@/features/drivers/drivers.service'
import { invalidate } from '@/api/query-keys'
import { listRows } from '@/api/types'
import type { DriverRequest } from '@/api/types'

export const driversQueryKey = ['drivers'] as const

export function useDrivers({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: driversQueryKey,
    queryFn: driversService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    // Tolerates both shapes — the endpoint has served each. See `listRows`.
    drivers: listRows(query.data),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetches one driver, which is the only way to learn its `transporterId` — the
 * list omits that field.
 *
 * The key nests under `driversQueryKey`, so saving invalidates both this and
 * the list in one call.
 */
export function useDriver(id: string | undefined) {
  const query = useQuery({
    queryKey: [...driversQueryKey, id],
    queryFn: () => driversService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  return {
    driver: query.data ?? null,
    isLoading: query.isLoading,
  }
}

export function useSaveDriver() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: DriverRequest & { id?: string }) =>
      id ? driversService.update(id, body) : driversService.create(body),
    onSuccess: () => invalidate(queryClient, 'drivers'),
  })
}

export function useAssignVehicle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: string; driverId: string }) =>
      driversService.assignVehicle(vehicleId, driverId),
    onSuccess: () => {
      // The assignment is not visible on either record yet, but refresh both in
      // case the API starts returning it.
      invalidate(queryClient, 'drivers')
    },
  })
}

export function useToggleDriverStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => driversService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'drivers'),
  })
}
