/**
 * @file Carries the refresh token in request bodies, since a native app sends
 * no cookie. Adds the stored token to the routes express reads it from, keeps
 * the token that the sign-in routes return, removes the token from a failed
 * request's error, and sets the passkey-setup flag.
 */
import {
  isAxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { revokeToken } from '@/http/revoke'
import { markSessionChange, refreshTokenStore } from '@/http/token-store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { isPasskeySetupRequired } from '@/types/passkey.types'

declare module 'axios' {
  /** Adds the body-token flag to the request config. */
  interface AxiosRequestConfig {
    /** Set when the body-token interceptor added `refreshToken` to the body. */
    _bodyToken?: boolean
  }
}

/** Routes (after the API prefix) whose POST body carries the stored refresh token. */
const INJECT = new Set([
  '/auth/logout',
  '/auth/sessions/revoke-others',
  '/auth/link/verify',
  '/auth/passkeys/sign-in/verify',
  '/invitations/confirm',
  '/auth/step-up/link/verify',
  '/auth/passkeys/step-up/verify',
])

/** Routes whose answer holds a new refresh token to keep. */
const CAPTURE = new Set([
  '/auth/link/verify',
  '/auth/passkeys/sign-in/verify',
  '/invitations/confirm',
])

/** Raised when a sign-in succeeded but its refresh token could not be stored on this device. */
export class SignInNotKeptError extends Error {
  /** Names the failure. */
  constructor() {
    super('We couldn’t keep you signed in on this device. Request a new link.')
    this.name = 'SignInNotKeptError'
  }
}

/**
 * The request's path without its query string.
 * @param url - The `config.url`, relative to the base URL.
 */
function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? ''
}

/**
 * Whether `config` is a POST to one of `paths`.
 * @param config - The request.
 * @param paths - The route list.
 */
function isPostTo(config: InternalAxiosRequestConfig, paths: Set<string>): boolean {
  return config.method?.toLowerCase() === 'post' && paths.has(pathOf(config.url))
}

/**
 * Merges the stored token into the body of an allow-listed request. A body
 * that already names `refreshToken` stays as it is; with no stored token the
 * body is untouched. A request this function filled in before is replayed
 * with a serialized body: the token is read again, since a refresh between
 * the attempts has rotated it. A store that cannot be read rejects the
 * request before it leaves.
 * @param config - The request.
 */
async function addToken(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
  if (!isPostTo(config, INJECT)) return config
  if (config._bodyToken && typeof config.data === 'string') {
    const token = await refreshTokenStore.read()
    if (token === null) return config
    const sent = JSON.parse(config.data) as Record<string, unknown>
    config.data = { ...sent, refreshToken: token }
    return config
  }
  // Request transforms run after the interceptors, so on a first attempt `data` is still the caller's object.
  const current: unknown = config.data ?? {}
  // Checked before the read: a revoke names its own token, and must leave even while the Keychain is locked.
  if (typeof current !== 'object' || current === null || 'refreshToken' in current) return config
  const token = await refreshTokenStore.read()
  if (token === null) return config
  config.data = { ...current, refreshToken: token }
  config._bodyToken = true
  return config
}

/**
 * Stores the refresh token a sign-in answer holds and removes it, and its
 * expiry, from the response. When the write fails, ends the server session
 * (best effort) and rejects. It marks a session change, so a refresh in
 * flight keeps nothing, and clears the passkey-setup flag.
 * @param response - The response.
 */
async function keepToken(response: AxiosResponse): Promise<AxiosResponse> {
  if (!isPostTo(response.config, CAPTURE)) return response
  const data = (response.data as { data?: Record<string, unknown> } | undefined)?.data
  const token = data?.refreshToken
  if (data === undefined || typeof token !== 'string') return response
  // Before and after the write: a refresh in flight must not replace this token with the old session's.
  markSessionChange()
  try {
    await refreshTokenStore.write(token)
  } catch {
    void revokeToken(token)
    throw new SignInNotKeptError()
  } finally {
    markSessionChange()
  }
  delete data.refreshToken
  delete data.refreshTokenExpiresAt
  // The new session is judged afresh; its first refused request sets the flag again.
  usePasskeySetupStore.getState().setRequired(false)
  return response
}

/**
 * Whether `value` is a plain object.
 * @param value - Anything.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Removes `refreshToken` from the body a failed request's config still holds.
 * Axios keeps the serialized body on the error, and a query or mutation error
 * state would otherwise hold a live token. Other keys stay.
 * @param error - The rejection.
 */
function dropSentToken(error: unknown): void {
  if (!isAxiosError(error) || !error.config) return
  const data: unknown = error.config.data
  if (typeof data === 'string') {
    let body: unknown
    try {
      body = JSON.parse(data)
    } catch {
      return
    }
    if (!isRecord(body) || !('refreshToken' in body)) return
    delete body.refreshToken
    error.config.data = JSON.stringify(body)
  } else if (isRecord(data) && 'refreshToken' in data) {
    const rest = { ...data }
    delete rest.refreshToken
    error.config.data = rest
  }
}

/**
 * Removes the sent token from the error, sets the passkey-setup flag when
 * `error` is a refusal for a missing passkey, then rethrows it.
 * @param error - The rejection.
 */
function onFailure(error: unknown): never {
  dropSentToken(error)
  if (isPasskeySetupRequired(error)) usePasskeySetupStore.getState().setRequired(true)
  throw error
}

/**
 * Installs the three interceptors on `client`. Axios runs request
 * interceptors in reverse order of registration and response interceptors in
 * registration order, so register this after the shared chain: the request
 * interceptor then runs first on every attempt, a replay included, and the
 * response interceptors run before the caller's promise settles. The error
 * handler runs after the shared chain's, whose replay reads the body before it
 * is removed.
 * @param client - The axios instance.
 * @param isApiRequest - Whether a request goes to this app's API.
 */
export function installBodyToken(
  client: AxiosInstance,
  isApiRequest: (config: InternalAxiosRequestConfig) => boolean
): void {
  client.interceptors.request.use((config) => (isApiRequest(config) ? addToken(config) : config))
  client.interceptors.response.use(
    (response) => (isApiRequest(response.config) ? keepToken(response) : response),
    onFailure
  )
}
