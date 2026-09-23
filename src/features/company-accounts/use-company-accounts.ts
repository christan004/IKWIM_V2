import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { companyAccountsService } from '@/features/company-accounts/company-accounts.service'
import { invalidate } from '@/api/query-keys'
import type { CompanyAccountRequest } from '@/api/types'

export const companyAccountsQueryKey = ['company-accounts'] as const

export function useCompanyAccounts({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: companyAccountsQueryKey,
    queryFn: companyAccountsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    // The envelope's items, defaulted so a caller never guards.
    accounts: query.data?.items ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useSaveCompanyAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    // One mutation for both paths: an id means update, its absence means create.
    mutationFn: ({ id, ...body }: CompanyAccountRequest & { id?: string }) =>
      id ? companyAccountsService.update(id, body) : companyAccountsService.create(body),
    onSuccess: () => invalidate(queryClient, 'companyAccounts'),
  })
}

export function useToggleCompanyAccountStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => companyAccountsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'companyAccounts'),
  })
}
