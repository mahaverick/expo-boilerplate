import { jest } from '@jest/globals'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/http/client'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-device', () => ({ modelName: 'Pixel 9' }))

/**
 * An adapter that answers every request with an empty success envelope and
 * keeps the config it was sent.
 * @returns The adapter and the configs it saw.
 */
function recordingAdapter(): { adapter: AxiosAdapter; sent: InternalAxiosRequestConfig[] } {
  const sent: InternalAxiosRequestConfig[] = []
  /** Answers with the envelope and keeps the config. */
  const adapter: AxiosAdapter = (config) => {
    sent.push(config)
    return Promise.resolve({
      data: { success: true, data: {} },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
    })
  }
  return { adapter, sent }
}

describe('apiClient', () => {
  it('names the native client, the device and the trace on an API request', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('/profile', { adapter })
    const config = sent[0]
    expect(config?.headers.get('X-Client')).toBe('native')
    expect(config?.headers.get('X-Device-Name')).toBe('Pixel 9')
    expect(config?.headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(config?.withCredentials).toBe(false)
  })

  it('sends to the configured API under its prefix', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('/profile', { adapter })
    const config = sent[0]
    expect(config && apiClient.getUri(config)).toBe('https://api.example.test/api/v1/profile')
  })

  it('names no device on a request to another host', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('https://elsewhere.example.test/thing', { adapter })
    const config = sent[0]
    expect(config?.headers.has('X-Device-Name')).toBe(false)
    expect(config?.headers.has('X-Client')).toBe(false)
    expect(config?.headers.has('traceparent')).toBe(false)
  })
})
