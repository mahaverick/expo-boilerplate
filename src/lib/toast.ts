/**
 * @file The app's toast API: `toast.success`, `toast.error` and
 * `toast.warning`, callable from anywhere, React or not, as on the web. Each
 * raise joins the queue in `states/toast-queue.store.ts`, which the toaster
 * reads. Nothing renders the queue in this plan.
 */
import { type ToastAction, type ToastType, useToastQueueStore } from '@/states/toast-queue.store'

/** What a toast call may pass beside its title. */
interface ToastOptions {
  /** A second line under the title. */
  description?: string
  /**
   * A key for the toast. Raising a toast with the key of one still queued
   * replaces it, so a burst of identical failures shows one toast.
   */
  id?: string
  /** A button on the toast. */
  action?: ToastAction
}

/** Numbers the ids given to toasts raised without one. */
let raised = 0

/** Queues a toast of `type`. */
function show(type: ToastType, title: string, options: ToastOptions = {}): void {
  const { id = `toast-${String((raised += 1))}`, description, action } = options
  useToastQueueStore.getState().add({ id, type, title, description, action })
}

/** The app's toasts. Each call returns nothing; dedupe through `options.id`. */
export const toast = {
  /** Confirms that an action succeeded. */
  success: (title: string, options?: ToastOptions) => show('success', title, options),
  /** Reports a failure. */
  error: (title: string, options?: ToastOptions) => show('error', title, options),
  /** Flags something the user should know before going on. */
  warning: (title: string, options?: ToastOptions) => show('warning', title, options),
  /** Closes the toast with `id`, or every toast when `id` is omitted. */
  dismiss: (id?: string) => useToastQueueStore.getState().remove(id),
}
