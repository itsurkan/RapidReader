
import type { Book } from 'epubjs';
import type { EpubProcessingState } from './types';

/**
 * Initializes the epubjs Book instance and sets up error handling.
 * Waits for the book's core metadata and structure to be ready.
 * @param arrayBuffer - The EPUB file content as an ArrayBuffer.
 * @param state - The processing state object.
 * @returns A promise resolving to the initialized and ready Book instance.
 * @throws Error if book initialization or ready state fails.
 */
export async function initializeBook(arrayBuffer: ArrayBuffer, state: EpubProcessingState): Promise<Book> {
    console.log("[INFO] Initializing epubjs Book instance...");
    const Epub = (await import('epubjs')).default; // Dynamic import
    state.book = Epub(arrayBuffer);
    console.log("[DEBUG] Book instance created.");

    // Setup a listener that will throw errors to be caught by the main handler
    state.bookErrorListener = (err: any) => {
        console.error("[BOOK ERROR EVENT]", err); // Log the error source
        // Enhance error message if possible
        let specificError = err;
        if (err?.message?.includes("Encryption") || err?.message?.includes("decryption")) {
            specificError = new Error(`DRM Protected: ${err.message}`);
        } else if (err?.message?.includes("missing central directory")) {
            specificError = new Error(`Corrupted EPUB (Zip): ${err.message}`);
        }
        throw specificError; // Re-throw to trigger the main catch block
    };
    // Listen for critical book errors
    state.book.on('book:error', state.bookErrorListener);

    // Optionally listen for generic errors (less critical, might not throw)
    state.book.on('error', (err: any) => console.warn("[EPUBJS GENERIC EVENT: error]", err));

    try {
        console.log("[INFO] Waiting for book.ready...");
        // book.ready ensures metadata and spine are parsed.
        // It resolves with the Book instance itself or navigation data depending on version,
        // but we just need to know it completed.
        await state.book.ready;
        console.log("[INFO] book.ready resolved. Metadata:", state.book.metadata);
        console.log(`[INFO] Spine items found: ${state.book.spine?.items?.length ?? 0}`);

        // Basic validation after ready
        if (!state.book.spine || !state.book.spine.items || state.book.spine.items.length === 0) {
             console.warn("[WARN] book.ready resolved, but spine seems empty or invalid.", state.book.spine);
             // Depending on strictness, you might throw here or let processSpineItems handle it.
             // throw new Error("EPUB loaded but contains no spine items.");
        }

        return state.book;
    } catch (initError: any) {
        console.error("[CRITICAL] Error during book.ready:", initError);
        // Re-throw a more specific error if possible
        if (initError?.message?.includes('missing central directory')) {
             throw new Error(`Corrupted EPUB (Zip): ${initError.message}`);
        }
        if (initError?.message?.includes('File is not a zip file')) {
             throw new Error(`Invalid EPUB format (not Zip): ${initError.message}`);
        }
        throw new Error(`Failed to initialize EPUB structure: ${initError?.message || initError}`);
    }
}

/**
 * Reads a File or fetches a resource from a path into an ArrayBuffer.
 * @param fileOrPath - The File object or URL string.
 * @returns A promise resolving to the ArrayBuffer.
 * @throws Error if reading/fetching fails.
 */
export async function getArrayBuffer(fileOrPath: File | string): Promise<ArrayBuffer> {
    console.log(`[INFO] Getting ArrayBuffer for: ${typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.name}`);
    if (typeof fileOrPath === 'string') {
        try {
            const response = await fetch(fileOrPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            }
            return await response.arrayBuffer();
        } catch (fetchError: any) {
             console.error(`[FETCH ERROR] Failed to fetch EPUB from path '${fileOrPath}':`, fetchError);
            throw new Error(`Failed to fetch EPUB from path: ${fetchError?.message || fetchError}`);
        }
    } else {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result instanceof ArrayBuffer) {
                    resolve(e.target.result);
                } else {
                    reject(new Error("Failed to read file as ArrayBuffer."));
                }
            };
            reader.onerror = (e) => {
                console.error("[FILE READ ERROR]", reader.error);
                reject(new Error(`Error reading file: ${reader.error?.message || 'Unknown'}`));
            };
            reader.readAsArrayBuffer(fileOrPath);
        });
    }
}
