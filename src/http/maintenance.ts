/**
 * @file The app's side of maintenance mode: the response interceptor that
 * keeps the maintenance store in step with every API answer, the recovery
 * that runs when `full` ends, and the hook screens read the mode through.
 */
import { isAxiosError, type AxiosInstance } from 'axios'
import { ensureSession } from '@/http/session'
import { maintenanceHeaderValue } from '@/lib/maintenance-state'
import { queryClient } from '@/lib/query-client'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { MAINTENANCE_MODE, READ_ONLY_MODE, type MaintenanceMode } from '@/types/api.types'

/**
 * Reads every response `client` returns, success or failure, into the
 * maintenance store: the `Maintenance-Mode` header, and a 503's
 * `MAINTENANCE_MODE` or `READ_ONLY_MODE` body. It never changes the outcome:
 * a failure still rejects with its own error.
 * @param client - The axios instance to watch.
 */
export function installMaintenanceInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => {
      useMaintenanceModeStore.getState().setFromHeader(maintenanceHeaderValue(response.headers))
      return response
    },
    (error: unknown) => {
      if (isAxiosError<unknown>(error) && error.response) {
        const { status, headers, data } = error.response
        const store = useMaintenanceModeStore.getState()
        store.setFromHeader(maintenanceHeaderValue(headers))
        const code =
          typeof data === 'object' && data !== null ? (data as { code?: unknown }).code : undefined
        if (status === 503 && (code === MAINTENANCE_MODE || code === READ_ONLY_MODE)) {
          store.setFromError(code, data)
        }
      }
      throw error
    }
  )
}

/**
 * Puts the session and the screens back in step after `full` ends. It checks
 * the session first: `ensureSession` signs out only on an auth verdict, and
 * its rejection is swallowed because a verdict has already signed out. Then
 * every query refetches.
 */
export async function recoverFromMaintenance(): Promise<void> {
  await ensureSession().catch(() => undefined)
  await queryClient.invalidateQueries()
}

/**
 * Runs `recoverFromMaintenance` each time the mode leaves `full`, whatever
 * screen is mounted.
 * @returns The cleanup, which removes the subscription.
 */
export function installMaintenanceRecovery(): () => void {
  return useMaintenanceModeStore.subscribe((state, previous) => {
    if (previous.mode !== 'full' || state.mode === 'full') return
    void recoverFromMaintenance()
  })
}

/**
 * The maintenance mode the app holds, re-rendering the caller on a change.
 * @returns `off`, `read_only` or `full`.
 */
export function useMaintenanceMode(): MaintenanceMode {
  return useMaintenanceModeStore((state) => state.mode)
}
