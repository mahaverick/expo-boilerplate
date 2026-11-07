import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StepUpDialog } from '@/components/step-up/step-up-dialog'
import { StepUpContext, StepUpWaitingContext, type StepUp } from '@/hooks/use-step-up'
import { isReauthRequired, markRefusedAfterConfirm, sentWithCurrentToken } from '@/lib/step-up'
import { useAuthStore } from '@/states/auth.store'

/** An action refused for a stale sign-in: `resolve` retries it after a confirmation, `reject` surfaces its refusal after a cancel. */
interface Waiter {
  resolve: () => void
  reject: () => void
}

/**
 * Owns the one "Confirm it’s you" dialog. Every action refused with
 * REAUTH_REQUIRED while it is open waits on the same confirmation, so two
 * refused actions never stack two dialogs, and one confirmation retries both.
 * `useStepUpWaiting()` reads true for as long as the dialog is open. The root
 * layout mounts it once, around the stack, so a route such as
 * `/auth/confirm` never unmounts a waiting dialog. It stays mounted across a
 * sign-out too, so a sign-out closes the dialog and rejects every waiter with
 * its original refusal; the dialog would otherwise sit over the sign-in screen.
 * @param props - The app underneath.
 * @param props.children - The app.
 * @returns The app, with the dialog while a step-up waits.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const waiters = useRef<Waiter[]>([])

  const finish = useCallback((confirmed: boolean) => {
    const waiting = waiters.current
    waiters.current = []
    setOpen(false)
    for (const waiter of waiting) {
      if (confirmed) waiter.resolve()
      else waiter.reject()
    }
  }, [])

  useEffect(
    () =>
      useAuthStore.subscribe((state) => {
        if (!state.isAuthenticated && waiters.current.length > 0) finish(false)
      }),
    [finish]
  )

  const confirm = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiters.current.push({ resolve, reject })
        setOpen(true)
      }),
    []
  )

  const value = useMemo<StepUp>(
    () => ({
      run: async <T,>(action: () => Promise<T>): Promise<T> => {
        try {
          return await action()
        } catch (error) {
          if (!isReauthRequired(error)) throw error
          // Refused with an older token than the store holds: another confirmation already landed.
          if (!sentWithCurrentToken(error)) return action()
          try {
            await confirm()
          } catch {
            throw error
          }
          // Once: a second REAUTH_REQUIRED rejects rather than reopening the dialog.
          try {
            return await action()
          } catch (retryError) {
            if (isReauthRequired(retryError)) markRefusedAfterConfirm(retryError)
            throw retryError
          }
        }
      },
    }),
    [confirm]
  )

  return (
    <StepUpContext value={value}>
      <StepUpWaitingContext value={open}>{children}</StepUpWaitingContext>
      {open ? (
        <StepUpDialog
          onConfirmed={() => {
            finish(true)
          }}
          onDismissed={() => {
            finish(false)
          }}
        />
      ) : null}
    </StepUpContext>
  )
}
