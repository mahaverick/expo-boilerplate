import { create } from 'zustand'

/** The toast types the app raises. */
export type ToastType = 'success' | 'error' | 'warning'

/** A toast's button: its label and what pressing it does. */
export interface ToastAction {
  /** The button's text. */
  label: string
  /** Runs when the button is pressed, before the toast closes. */
  onPress: () => void
}

/** One raised toast, as the queue holds it. */
interface QueuedToast {
  /** The toast's key: the caller's `id`, or one `lib/toast` numbers. */
  id: string
  type: ToastType
  title: string
  description?: string
  action?: ToastAction
}

/** The queue and the two ways it changes. */
interface ToastQueueState {
  /** Raised toasts, oldest first. */
  toasts: QueuedToast[]
  /** Adds a toast, replacing a queued one with the same id. */
  add: (toast: QueuedToast) => void
  /** Removes the toast with `id`, or every toast when `id` is omitted. */
  remove: (id?: string) => void
}

/** The most toasts the queue keeps. */
const QUEUE_LIMIT = 10

/**
 * The toasts `lib/toast` raised, for the toaster to render. Nothing renders
 * them in this plan.
 */
export const useToastQueueStore = create<ToastQueueState>()((set) => ({
  toasts: [],
  add: (toast) =>
    set((state) => ({
      toasts: [...state.toasts.filter((queued) => queued.id !== toast.id), toast].slice(
        -QUEUE_LIMIT
      ),
    })),
  remove: (id) =>
    set((state) => ({
      toasts: id === undefined ? [] : state.toasts.filter((queued) => queued.id !== id),
    })),
}))
