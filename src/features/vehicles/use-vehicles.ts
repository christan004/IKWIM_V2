import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { vehiclesService } from '@/features/vehicles/vehicles.service'
import { invalidate } from '@/api/query-keys'
import type { VehicleRequest } from '@/api/types'

export const vehiclesQueryKey = ['vehicles'] as const

export function useVehicles({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: vehiclesQueryKey,
    queryFn: vehiclesService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    vehicles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveVehicle() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: VehicleRequest & { id?: string }) =>
      id ? vehiclesService.update(id, body) : vehiclesService.create(body),
    onSuccess: () => invalidate(queryClient, 'vehicles'),
  })
}

export function useToggleVehicleStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => vehiclesService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'vehicles'),
  })
}
