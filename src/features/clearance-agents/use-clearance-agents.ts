import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearanceAgentsService } from '@/features/clearance-agents/clearance-agents.service'
import { invalidate } from '@/api/query-keys'
import type { ClearanceAgentRequest } from '@/api/types'

export const clearanceAgentsQueryKey = ['clearing-agents'] as const

export function useClearanceAgents({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: clearanceAgentsQueryKey,
    queryFn: clearanceAgentsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    agents: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveClearanceAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: ClearanceAgentRequest & { id?: string }) =>
      id ? clearanceAgentsService.update(id, body) : clearanceAgentsService.create(body),
    onSuccess: () => invalidate(queryClient, 'clearanceAgents'),
  })
}

export function useToggleClearanceAgentStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clearanceAgentsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'clearanceAgents'),
  })
}

export function useDeleteClearanceAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clearanceAgentsService.remove(id),
    onSuccess: () => invalidate(queryClient, 'clearanceAgents'),
  })
}
