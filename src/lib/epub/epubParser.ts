
import type { EpubProcessingState, ToastFunction, DismissFunction } from './types';
import { processSpineItems } from './sectionUtils';
import { finalizeProcessing, handleCriticalError } from './errorHandler';
import { cleanupResources } from './resourceManager';
import { getArrayBuffer, initializeBook } from './bookManager';

/**
 * Main function to parse an EPUB file and extract text content.
 * Orchestrates the loading, processing, and cleanup steps.
 *
 * @param fileOrPath - Either a File object or a URL string to the EPUB file.
 * @param toast - Function to display toast notifications.
 * @param dismiss - Function to dismiss toast notifications.
 * @returns A promise that resolves with the extracted text content or rejects with an error.
 */
export const parseEpub = (
    fileOrPath: File | string,
    toast: ToastFunction,
    dismiss: DismissFunction
): Promise<string> => {
    const fileName = typeof fileOrPath === 'string' ? fileOrPath.substring(fileOrPath.lastIndexOf('/') + 1) : fileOrPath.name;

    // State object to manage processing details across functions
    const state: EpubProcessingState = {
        book: null,
        toastCtrl: null,
        bookErrorListener: null,
        sectionTexts: [],
        sectionErrors: 0,
        totalSections: 0,
    };

    let toastId: string | undefined;

    // Wrap the entire process in a promise
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Show Loading Toast
            state.toastCtrl = toast({
                title: 'Loading EPUB...',
                description: `Processing ${fileName}`
            });
            toastId = state.toastCtrl?.id;
            console.log(`[INFO] Started processing ${fileName}. Toast ID: ${toastId}`);

            // 2. Get EPUB Data
            const arrayBuffer = await getArrayBuffer(fileOrPath);
            console.log(`[INFO] ArrayBuffer size: ${arrayBuffer.byteLength}`);

            // 3. Initialize Book
            await initializeBook(arrayBuffer, state);
            if (!state.book) throw new Error("Book initialization failed unexpectedly."); // Guard against null book

            // 4. Process Spine Items (Loads & Parses Sections)
            await processSpineItems(state);

            // 5. Finalize (Normalize Text & Resolve/Reject)
            finalizeProcessing(state, toast, resolve, reject);

        } catch (err: any) {
            // 6. Handle any critical errors during the process
            handleCriticalError(err, state, reject);
        } finally {
            // 7. Cleanup resources regardless of success or failure
            console.log(`[INFO] Cleaning up resources for ${fileName}. Toast ID to dismiss: ${toastId}`);
            cleanupResources(state, toastId, dismiss);
        }
    });
};
