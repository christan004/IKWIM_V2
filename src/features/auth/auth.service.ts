import { apiClient } from '@/api/axios-instance'
import type {
  AuthSession,
  LoginRequest,
  PasswordResetRequestResponse,
} from '@/api/types'

export const authService = {
  /**
   * The response carries **no tokens** — only `user` and `permissions`. The
   * access and refresh tokens arrive as `HttpOnly` cookies the browser stores
   * on its own.
   */
  login: (body: LoginRequest) =>
    apiClient<AuthSession>({ url: '/auth/login', method: 'POST', data: body }),

  /**
   * Also the session-restore call: the API has no /auth/me, but /auth/refresh
   * returns the user and permissions.
   *
   * **Takes no argument** — the refresh token is a cookie, so there is nothing
   * to pass and nothing to read back.
   */
  refresh: () => apiClient<AuthSession>({ url: '/auth/refresh', method: 'POST' }),

  /**
   * **Must be called** rather than just clearing local state: the cookies are
   * `HttpOnly`, so only the server can expire them. It responds with both set
   * to `Max-Age=0`, after which the session is dead — verified.
   */
  logout: () => apiClient<null>({ url: '/auth/logout', method: 'POST' }),

  /**
   * Sends the reset link. The response carries a `token`, but the client never
   * reads it — the user must receive it by email, otherwise anyone who can post
   * an address could reset that account's password.
   */
  requestPasswordReset: (email: string) =>
    apiClient<PasswordResetRequestResponse>({
      url: '/auth/password-reset/request',
      method: 'POST',
      data: { email },
    }),

  /**
   * Redeems the emailed token and sets the new password.
   *
   * There is no endpoint to check a token on its own, so validity is only known
   * once this is called — see the note in reset-password-page.tsx.
   */
  confirmPasswordReset: (token: string, password: string) =>
    apiClient<null>({
      url: '/auth/password-reset/confirm',
      method: 'POST',
      data: { token, password },
    }),
}
