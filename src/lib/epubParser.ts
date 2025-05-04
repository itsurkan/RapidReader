import type { Book } from 'epubjs';
import type { EpubProcessingState, ToastFunction, DismissFunction } from './epub/types';
import { processSpineItems } from './epub/sectionUtils';
import { finalizeProcessing, handleCriticalError } from './epub/errorHandler';
import { cleanupResources } from './epub/resourceManager';

/**
 * Reads a File or fetches a resource from a path into an ArrayBuffer.
 * @param fileOrPath - The File object or URL string.
 * @returns A promise resolving to the ArrayBuffer.
 * @throws Error if reading/fetching fails.
 */
async function getArrayBuffer(fileOrPath: File | string): Promise<ArrayBuffer> {
    if (typeof fileOrPath === 'string') {
        const response = await fetch(fileOrPath);
        if (!response.ok) {
            throw new Error(`Failed to fetch EPUB from path: ${response.statusText}`);
        }
        return await response.arrayBuffer();
    } else {
        return await fileOrPath.arrayBuffer();
    }
}

/**
 * Initializes the epubjs Book instance and sets up error handling.
 * @param arrayBuffer - The EPUB file content as an ArrayBuffer.
 * @param state - The processing state object.
 * @returns A promise resolving to the initialized Book instance.
 * @throws Error if book initialization fails.
 */
async function initializeBook(arrayBuffer: ArrayBuffer, state: EpubProcessingState): Promise<Book> {
    const Epub = (await import('epubjs')).default;
    state.book = Epub(arrayBuffer);

    // Setup a listener that will throw errors to be caught by the main handler
    state.bookErrorListener = (err: any) => {
        console.error("[BOOK ERROR EVENT]", err); // Log the error source
        throw err; // Re-throw to trigger the main catch block
    };
    state.book.on('book:error', state.bookErrorListener);

    // Optionally listen for generic errors too
    state.book.on('error', (err: any) => console.warn("[EPUBJS GENERIC ERROR]", err));

    await state.book.ready; // Wait for the book metadata to be ready
    console.log("[INFO] Book ready. Metadata:", state.book.metadata);
    return state.book;
}


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
    const fileName = typeof fileOrPath === 'string' ? 'epub_from_path' : fileOrPath.name;

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

            // 2. Get EPUB Data
            const arrayBuffer = await getArrayBuffer(fileOrPath);

            // 3. Initialize Book
            await initializeBook(arrayBuffer, state);

            // 4. Process Spine Items (Loads & Parses Sections)
            await processSpineItems(state);

            // 5. Finalize (Normalize Text & Resolve/Reject)
            finalizeProcessing(state, toast, resolve, reject);

        } catch (err: any) {
            // 6. Handle any critical errors during the process
            handleCriticalError(err, state, reject);
        } finally {
            // 7. Cleanup resources regardless of success or failure
            cleanupResources(state, toastId, dismiss);
        }
    });
};
