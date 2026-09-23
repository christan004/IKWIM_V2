import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsService } from '@/features/clients/clients.service'
import { invalidate } from '@/api/query-keys'
import type { Client, ClientRequest, ClientUpdateRequest } from '@/api/types'

export const clientsQueryKey = ['clients'] as const

export function useClients({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: clientsQueryKey,
    queryFn: clientsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  const clients = useMemo(() => query.data?.items ?? [], [query.data])

  /**
   * The client **organisations**, derived from the users that belong to them.
   *
   * The API exposes no endpoint listing organisations — `clientId` appears only
   * as a bare id on a user — so they are reconstructed here. Each org is named
   * after its `clientAdmin`, who is the user that created it.
   */
  const organizations = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; memberCount: number }>()
    for (const client of clients) {
      if (!client.clientId) continue
      const existing = byId.get(client.clientId)
      const isAdmin = client.position === 'clientAdmin'
      // The admin names the organisation; anyone else only counts toward it.
      const label = isAdmin
        ? `${client.firstName} ${client.lastName}`.trim() || client.email
        : (existing?.label ?? '')
      byId.set(client.clientId, {
        id: client.clientId,
        label: label || existing?.label || '',
        memberCount: (existing?.memberCount ?? 0) + 1,
      })
    }
    return [...byId.values()]
  }, [clients])

  return {
    clients,
    organizations,
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ClientRequest) => clientsService.create(body),
    onSuccess: () => invalidate(queryClient, 'clients'),
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: ClientUpdateRequest & { id: string }) =>
      clientsService.update(id, body),
    onSuccess: () => invalidate(queryClient, 'clients'),
  })
}

export function useToggleClientStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clientsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'clients'),
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clientsService.remove(id),
    onSuccess: () => invalidate(queryClient, 'clients'),
  })
}

/** Re-exported so callers need not import the type separately. */
export type { Client }
