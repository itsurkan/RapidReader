import type { EpubProcessingState, DismissFunction } from './types';

/**
 * Cleans up resources like the book instance and toast.
 * @param state - The processing state.
 * @param toastId - The ID of the loading toast.
 * @param dismiss - The function to dismiss toasts.
 */
export function cleanupResources(
    state: EpubProcessingState,
    toastId: string | undefined,
    dismiss: DismissFunction
): void {
    // Ensure toast is dismissed
    if (toastId) {
        try {
            dismiss(toastId);
             console.log("[DEBUG] Dismissed toast ID:", toastId);
        } catch (dismissError) {
             console.warn("[WARN] Error dismissing toast:", dismissError);
        }
        state.toastCtrl = null; // Clear the reference regardless of dismissal success
    }

    // Ensure book is destroyed
    if (state.book && typeof state.book.destroy === 'function') {
        try {
            state.book.destroy();
            console.log("[INFO] EPUB book instance destroyed.");
        } catch (destroyError) {
            console.warn("[WARN] Error destroying book instance:", destroyError);
        }
        state.book = null; // Clear the reference
    }

    // Ensure the error listener is removed if it hasn't been already (double-check)
    if (state.book && typeof state.book.off === 'function' && state.bookErrorListener) {
        try {
             state.book.off('book:error', state.bookErrorListener);
             console.log("[DEBUG] Ensured removal of book:error listener during cleanup.");
        } catch (listenerError) {
            console.warn("[WARN] Error re-removing book:error listener during cleanup:", listenerError);
        }
    }
}
