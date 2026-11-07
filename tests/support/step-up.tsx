/**
 * @file Helpers for the step-up tests: access tokens with an `auth_time`
 * claim, the API's `REAUTH_REQUIRED` refusal, and a caller that runs an action
 * through `useStepUp().run` inside the provider.
 */
import { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Text } from 'react-native'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { Button } from '@/components/ui/button'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { apiClient } from '@/http/client'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { renderScreen, type FakeAnswer } from '@/tests/support/api'

/** The path the test action posts to: a write express guards with step-up. */
export const ACTION_PATH = '/auth/sessions/revoke-others'

/**
 * One part of a JWT: JSON, base64url-encoded.
 * @param value - The part's JSON value.
 */
function part(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * An access token whose payload carries `auth_time`, unsigned, which is all
 * `authTimeOf` reads.
 * @param authTime - The claim, in seconds since the epoch.
 * @param id - Makes two tokens with the same claim differ.
 */
export function tokenWith(authTime: number, id = 'a'): string {
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: 'u1', auth_time: authTime, jti: id })}.sig`
}

/** Express's 401 for a write whose session last authenticated too long ago. */
export const REAUTH_ANSWER: FakeAnswer = {
  status: 401,
  data: {
    success: false,
    statusCode: 401,
    code: 'REAUTH_REQUIRED',
    message: 'Confirm it’s you to continue.',
  },
}

/** The action's success. */
export const DONE_ANSWER: FakeAnswer = { status: 200, data: { success: true, data: 'done' } }

/** What one press of the caller's button settled with. */
export type Outcome = { value: unknown } | { error: unknown }

/**
 * A screen that runs the action through `useStepUp().run` on each press of
 * "Act", and shows `STEP_UP_WAITING_LABEL` while the step-up waits.
 * @param props - Where each outcome goes.
 * @param props.outcomes - Collects each press's outcome, in order of settling.
 * @returns The caller.
 */
function Caller({ outcomes }: { outcomes: Outcome[] }) {
  const { run } = useStepUp()
  const waiting = useStepUpWaiting()
  return (
    <>
      <Button
        label="Act"
        variant="primary"
        onPress={() => {
          run(
            async () => (await apiClient.post<{ data: unknown }>(ACTION_PATH, {})).data.data
          ).then(
            (value) => outcomes.push({ value }),
            (error: unknown) => outcomes.push({ error })
          )
        }}
      />
      {waiting ? <Text>{STEP_UP_WAITING_LABEL}</Text> : null}
    </>
  )
}

/**
 * A query client that holds the client settings, so the update check makes no request.
 * @returns The client.
 */
function stepUpClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(clientSettingsKeys.all, null)
  return client
}

/**
 * Renders the caller inside the provider.
 * @param beside - Rendered next to the caller, inside the same provider, such as a route screen.
 * @returns The outcomes the caller collects.
 */
export async function renderCaller(beside?: ReactNode): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  await renderScreen(
    <StepUpProvider>
      <Caller outcomes={outcomes} />
      {beside}
    </StepUpProvider>,
    stepUpClient()
  )
  return outcomes
}
