/**
 * @file Carries the refresh token in request bodies, since a native app sends
 * no cookie. Adds the stored token to the routes express reads it from, keeps
 * the token that the sign-in routes return, and sets the passkey-setup flag.
 */
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { revokeToken } from '@/http/revoke'
import { refreshTokenStore } from '@/http/token-store'
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
 * the attempts has rotated it.
 * @param config - The request.
 */
async function addToken(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
  if (!isPostTo(config, INJECT)) return config
  const token = await refreshTokenStore.read()
  if (token === null) return config
  if (config._bodyToken && typeof config.data === 'string') {
    const sent = JSON.parse(config.data) as Record<string, unknown>
    config.data = { ...sent, refreshToken: token }
    return config
  }
  // Request transforms run after the interceptors, so on a first attempt `data` is still the caller's object.
  const current: unknown = config.data ?? {}
  if (typeof current !== 'object' || current === null || 'refreshToken' in current) return config
  config.data = { ...current, refreshToken: token }
  config._bodyToken = true
  return config
}

/**
 * Stores the refresh token a sign-in answer holds and removes it, and its
 * expiry, from the response. When the write fails, ends the server session
 * (best effort) and rejects.
 * @param response - The response.
 */
async function keepToken(response: AxiosResponse): Promise<AxiosResponse> {
  if (!isPostTo(response.config, CAPTURE)) return response
  const data = (response.data as { data?: Record<string, unknown> } | undefined)?.data
  const token = data?.refreshToken
  if (data === undefined || typeof token !== 'string') return response
  try {
    await refreshTokenStore.write(token)
  } catch {
    void revokeToken(token)
    throw new SignInNotKeptError()
  }
  delete data.refreshToken
  delete data.refreshTokenExpiresAt
  return response
}

/**
 * Sets the passkey-setup flag when `error` is a refusal for a missing passkey,
 * then rethrows it.
 * @param error - The rejection.
 */
function flagPasskeySetup(error: unknown): never {
  if (isPasskeySetupRequired(error)) usePasskeySetupStore.getState().setRequired(true)
  throw error
}

/**
 * Installs the three interceptors on `client`. Axios runs request interceptors
 * in reverse order of registration and response interceptors in registration
 * order, so register this after the shared chain: the request interceptor then
 * runs first on every attempt, a replay included, and the response
 * interceptors run before the caller's promise settles.
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
    flagPasskeySetup
  )
}
