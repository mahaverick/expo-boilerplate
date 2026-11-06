import { create } from 'zustand'

/** Whether the API refuses this account until it has a passkey. */
interface PasskeySetupState {
  required: boolean
  setRequired: (required: boolean) => void
}

/**
 * Set when any request fails with `PASSKEY_SETUP_REQUIRED`. The blocking
 * screen reads it. Every sign-out, every sign-in and every return to the
 * foreground resets it.
 */
export const usePasskeySetupStore = create<PasskeySetupState>()((set) => ({
  required: false,
  setRequired: (required) => set({ required }),
}))
