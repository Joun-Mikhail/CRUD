import { isApiError } from '../services/apiClient'

export interface ErrorSummary {
  title: string
  message: string
  code: string | null
  requestId: string | null
  /** True when no response was received at all. */
  network: boolean
}

const TITLES: Record<string, string> = {
  NETWORK_ERROR: 'Backend unavailable',
  UNAUTHORIZED: 'Not signed in',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Not found',
  THROTTLED: 'Too many requests',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  VERSION_CONFLICT: 'Edit conflict',
}

/** Turns anything thrown into text that is safe and useful to show. */
export function summarizeError(error: unknown): ErrorSummary {
  if (isApiError(error)) {
    return {
      title: TITLES[error.code] ?? 'Something went wrong',
      message: error.message,
      code: error.code,
      requestId: error.requestId,
      network: error.kind === 'network',
    }
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    code: null,
    requestId: null,
    network: false,
  }
}
