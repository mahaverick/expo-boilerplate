/**
 * @file The client port: the axios instance every shared query sends through,
 * pointed at the API this build names. It is the only file that reads
 * `EXPO_PUBLIC_API_URL`.
 */
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { modelName } from 'expo-device'
import { API_PREFIX } from '@/constants/routes'
import { createApiClient } from '@/http/create-api-client'
import { installInterceptors as installSharedInterceptors } from '@/http/interceptors'
import { broadcastLogout, ensureSession, redirectToLogin } from '@/http/session'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'

export { unwrap } from '@/http/create-api-client'

/**
 * The API's origin, from the build profile. Read through the literal
 * `process.env.EXPO_PUBLIC_API_URL`, the only form babel-preset-expo inlines.
 * An unset value leaves a relative base: no request counts as an API request,
 * so none carries the device name, and importing this file never throws.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

/**
 * Whether `config` is a call to this app's API: the configured origin, under
 * `API_PREFIX`. Only those carry the client, device and trace headers; an
 * absolute URL to anywhere else never does.
 */
function isApiRequest(client: AxiosInstance, config: InternalAxiosRequestConfig): boolean {
  try {
    const api = new URL(API_URL)
    const url = new URL(client.getUri(config))
    return url.origin === api.origin && url.pathname.startsWith(`${API_PREFIX}/`)
  } catch {
    return false
  }
}

/**
 * Names this client to the API on each of its requests: `X-Client: native`,
 * so express answers in the native shape, and `X-Device-Name`, the device's
 * model, which the session list shows.
 */
function addClientHeaders(
  client: AxiosInstance,
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  if (!isApiRequest(client, config)) return config
  config.headers.set('X-Client', 'native')
  if (modelName) config.headers.set('X-Device-Name', modelName)
  return config
}

/**
 * Keeps the bearer token on the API: removes `Authorization` from a request
 * to any other origin or path. The shared token interceptor sets it on every
 * request, without asking `isApiRequest`.
 */
function dropForeignAuthorization(
  client: AxiosInstance,
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  if (!isApiRequest(client, config)) config.headers.delete('Authorization')
  return config
}

/**
 * Installs the token guard, then the shared interceptor chain (interceptors.ts)
 * on `client` with this app's ports, then the client headers.
 *
 * Import cycle (client → session): each port is a function that reads
 * session.ts's export only when a request runs, never while the modules are
 * still loading.
 */
function installInterceptors(client: AxiosInstance): void {
  // Axios runs request interceptors in reverse order of registration, so the guard, registered first, runs after the shared token interceptor.
  client.interceptors.request.use((config) => dropForeignAuthorization(client, config))
  installSharedInterceptors(client, {
    isApiRequest: (config) => isApiRequest(client, config),
    ensureSession: () => ensureSession(),
    signOut: () => {
      useAuthStore.getState().logout()
      // A non-expiry 401 is a verdict the shared core never sees, so it cannot clear the store.
      void refreshTokenStore.clear()
      broadcastLogout()
      redirectToLogin()
    },
    redirectToLogin: () => {
      redirectToLogin()
    },
  })
  client.interceptors.request.use((config) => addClientHeaders(client, config))
}

/**
 * The axios instance every REST call goes through. It sends no cookie: a
 * native app presents its refresh token in the request body. The timeout and
 * JSON header come from `createApiClient`.
 */
export const apiClient: AxiosInstance = createApiClient({
  baseURL: `${API_URL}${API_PREFIX}`,
  withCredentials: false,
})

installInterceptors(apiClient)
