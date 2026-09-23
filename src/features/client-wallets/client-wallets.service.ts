import { apiClient } from '@/api/axios-instance'
import type {
  ClientWallet,
  ClientWalletRequest,
  Paginated,
  WalletMovement,
  WalletMovementFilter,
  WalletMovementRequest,
} from '@/api/types'

/** ⚠️ Wallet ids are **CUIDs**, not UUIDs. */
export const clientWalletsService = {
  /** Returns a paginated envelope, like company accounts. */
  list: () => apiClient<Paginated<ClientWallet>>({ url: '/client-wallets', method: 'GET' }),

  get: (id: string) =>
    apiClient<ClientWallet | null>({ url: `/client-wallets/${id}`, method: 'GET' }),

  /** The whole body is `{ clientId }` — a wallet is opened for an organisation. */
  create: (body: ClientWalletRequest) =>
    apiClient<ClientWallet>({ url: '/client-wallets', method: 'POST', data: body }),

  /**
   * Toggles active ↔ inactive.
   *
   * `PATCH` rather than `PUT`, matching clients, authorizers and company
   * accounts — the newer endpoints in this API have settled on `PATCH`.
   */
  toggleStatus: (id: string) =>
    apiClient<ClientWallet>({ url: `/client-wallets/${id}/status`, method: 'PATCH', data: {} }),

  /**
   * The wallet's ledger, newest first. Also a paginated envelope.
   *
   * 🔴 Returns `500` today — see `WalletMovementFilter`. Wired regardless, so
   * it works unchanged once the serialisation bug is fixed.
   */
  movements: (walletId: string, filter: WalletMovementFilter = {}) => {
    // Blank values are stripped rather than sent: a filter that is validated
    // when present treats `startDate=` as a rejection, not as "no filter".
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
    )
    return apiClient<Paginated<WalletMovement>>({
      url: `/client-wallets/${walletId}/movements`,
      method: 'GET',
      params,
    })
  },

  /**
   * Records a movement.
   *
   * `accountId` and `referenceId` are required **only for `DEPOSIT`** — see
   * `WalletMovementRequest` — so they are omitted rather than sent blank for
   * the other six types.
   */
  createMovement: (walletId: string, body: WalletMovementRequest) =>
    apiClient<WalletMovement>({
      url: `/client-wallets/${walletId}/movements`,
      method: 'POST',
      data: body,
    }),

  // No `remove`: `DELETE /client-wallets/:id` returns `ROUTE_NOT_FOUND`.
}
