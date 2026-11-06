/**
 * @file The app's one query client. It lives at module scope, so code outside
 * React (a forced sign-out in the HTTP layer) can empty the cache the screens
 * read. The root layout provides it.
 */
import { QueryClient } from '@tanstack/react-query'
import { isPasskeySetupRequired } from '@/types/passkey.types'

/**
 * The app's query client, with react's defaults: results stay fresh 30
 * seconds, and a failed query is retried once, except a refusal that asks for
 * a passkey, which a retry cannot change.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 1 && !isPasskeySetupRequired(error),
    },
  },
})
