import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientWalletsService } from '@/features/client-wallets/client-wallets.service'
import { invalidate } from '@/api/query-keys'
import type {
  ClientWalletRequest,
  WalletMovementFilter,
  WalletMovementRequest,
} from '@/api/types'

export const clientWalletsQueryKey = ['client-wallets'] as const

export function useClientWallets({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: clientWalletsQueryKey,
    queryFn: clientWalletsService.list,
    staleTime: 60_000,
    // Skipped when the caller lacks read permission, so the UI never fires a
    // request the API would reject.
    enabled,
  })

  return {
    wallets: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateClientWallet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ClientWalletRequest) => clientWalletsService.create(body),
    // A wallet belongs to a client, so the clients list shows it too.
    onSuccess: () => invalidate(queryClient, 'clientWallets'),
  })
}

/**
 * One wallet's ledger. Fetched lazily — only when a wallet is actually opened.
 */
export function useWalletMovements(
  walletId: string | undefined,
  { enabled = true, filter }: { enabled?: boolean; filter?: WalletMovementFilter } = {},
) {
  const query = useQuery({
    // The filter is part of the key, so each range caches separately.
    queryKey: [...clientWalletsQueryKey, walletId, 'movements', filter ?? {}],
    queryFn: () => clientWalletsService.movements(walletId!, filter),
    enabled: Boolean(walletId) && enabled,
    staleTime: 30_000,
    // Keeps the previous rows on screen while a new range loads.
    placeholderData: (previous) => previous,
  })

  return {
    movements: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useCreateWalletMovement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ walletId, ...body }: WalletMovementRequest & { walletId: string }) =>
      clientWalletsService.createMovement(walletId, body),
    // A movement changes the wallet's balance, so the list follows too.
    onSuccess: () => invalidate(queryClient, 'clientWallets'),
  })
}

export function useToggleClientWalletStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clientWalletsService.toggleStatus(id),
    onSuccess: () => invalidate(queryClient, 'clientWallets'),
  })
}
