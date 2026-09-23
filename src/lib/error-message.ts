import type { ApiErrorEnvelope } from '@/api/types'

type AxiosLike = { response?: { data?: ApiErrorEnvelope; status?: number } }

/** The API's error `code`, e.g. UNAUTHORIZED, VALIDATION_ERROR, USER_NOT_FOUND. */
export function errorCode(err: unknown): string | undefined {
  return (err as AxiosLike)?.response?.data?.error?.code
}

export function errorStatus(err: unknown): number | undefined {
  const data = (err as AxiosLike)?.response?.data
  return data?.error?.statusCode ?? (err as AxiosLike)?.response?.status
}

/** Human-readable message for a toast or banner. */
export function errorMessage(err: unknown): string {
  const apiError = (err as AxiosLike)?.response?.data?.error
  if (apiError?.message) return apiError.message
  if (!(err as AxiosLike)?.response) return 'Cannot reach the server. Check your connection.'
  return 'Something went wrong'
}

/**
 * Field-level messages from a VALIDATION_ERROR, collapsed to `field -> first
 * message` so they can be fed straight into react-hook-form's setError.
 */
export function fieldErrors(err: unknown): Record<string, string> | undefined {
  const details = (err as AxiosLike)?.response?.data?.error?.details
  if (!details?.length) return undefined

  const map: Record<string, string> = {}
  for (const detail of details) {
    map[detail.field] ??= detail.message
  }
  return map
}
