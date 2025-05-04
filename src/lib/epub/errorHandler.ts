import { isLikelyDrmError } from '@/lib/epubParsingUtils';
import { normalizeAndJoinText } from './textUtils';
import type { EpubProcessingState, ToastFunction } from './types';

/**
 * Handles the successful resolution or rejection based on the processing results.
 * @param state - The final processing state.
 * @param toast - The toast function.
 * @param resolve - The promise resolve function.
 * @param reject - The promise reject function.
 */
export function finalizeProcessing(
    state: EpubProcessingState,
    toast: ToastFunction,
    resolve: (value: string | PromiseLike<string>) => void,
    reject: (reason?: any) => void
): void {
    const { sectionTexts, sectionErrors, totalSections } = state;
    const fullText = normalizeAndJoinText(sectionTexts);

    if (fullText.length > 0) {
        if (sectionErrors > 0) {
            toast({
                title: 'EPUB Parsed with Warnings',
                description: `Processed ${totalSections} sections, but ${sectionErrors} failed. Content may be missing.`,
                variant: 'destructive',
                duration: 8000,
            });
        } else {
            console.log("[INFO] EPUB parsing successful.");
        }
        resolve(fullText);
    } else {
        let errorMsg: string;
        if (totalSections === 0) {
            errorMsg = "EPUB file has no content sections in its spine.";
        } else if (sectionErrors === totalSections) {
            errorMsg = `Failed to extract any text. All ${totalSections} sections failed to load or parse. Check for DRM or file corruption.`;
        } else {
            errorMsg = "EPUB processing yielded no text. File might be empty, image-based, non-standard, or DRM protected.";
        }
        console.error(`[ERROR] Finalizing: ${errorMsg}`);
        reject(new Error(errorMsg));
    }
}


/**
 * Handles critical errors during EPUB initialization or processing.
 * @param err - The error object.
 * @param state - The processing state (for cleanup reference).
 * @param reject - The promise reject function.
 */
export function handleCriticalError(
    err: any,
    state: EpubProcessingState,
    reject: (reason?: any) => void
): void {
    console.error("[CRITICAL] EPUB Processing Error:", err, err.stack?.substring(0, 500));

    let errorMessage = "Error parsing EPUB file.";
    if (isLikelyDrmError(err)) errorMessage += " This file might be DRM-protected.";
    else if (err.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format (not a valid zip).";
    else if (err.message?.includes('missing central directory')) errorMessage += " Invalid EPUB format (corrupted zip).";
    else if (err.message?.includes('timeout') || err.name === 'TimeoutError') errorMessage += " Processing timed out.";
    else if (err.message) errorMessage += ` Details: ${err.message}`;
    else if (err instanceof Error) errorMessage += ` Details: ${err.message}`;
    else errorMessage += " An unexpected error occurred during processing.";

    // Attempt to remove the book error listener if it exists
    if (state.book && typeof state.book.off === 'function' && state.bookErrorListener) {
        try {
            state.book.off('book:error', state.bookErrorListener);
            console.log("[DEBUG] Removed book:error listener during critical error handling.");
        } catch (listenerError) {
            console.warn("[WARN] Error removing book:error listener:", listenerError);
        }
        state.bookErrorListener = null; // Ensure it's nullified
    }

    reject(new Error(errorMessage));
}
