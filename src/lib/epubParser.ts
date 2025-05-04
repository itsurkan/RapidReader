import type { Book, Contents, SpineItem } from 'epubjs';
import type Section from 'epubjs/types/section';
import { extractTextRecursive, isLikelyDrmError } from './epubParsingUtils';

type ToastFunction = (options: any) => { id: string; dismiss: () => void; update: (props: any) => void; };
type DismissFunction = (id: string) => void;

interface EpubProcessingState {
    book: Book | null;
    toastCtrl: ReturnType<typeof toast> | null;
    bookErrorListener: ((err: any) => void) | null;
    sectionTexts: string[];
    sectionErrors: number;
    totalSections: number;
}

/**
 * Loads the content of a single EPUB section.
 * @param section - The epubjs Section object.
 * @param book - The epubjs Book instance.
 * @returns A promise resolving to the loaded section contents (Document or string).
 */
async function loadSectionContents(section: Section, book: Book): Promise<Document | string> {
    try {
        // Epubjs v0.3.x uses section.load(book.request.bind(book)) or similar depending on request method
        // Assuming book.load exists and handles the request mechanism
        const contents = await section.load(book.load.bind(book));
        if (!contents) {
            throw new Error("Section loaded as null or undefined.");
        }
        return contents;
    } catch (error: any) {
        // Try to identify common network or CORS errors if applicable
        if (error.message?.includes('Failed to fetch') || error.message?.includes('CORS')) {
             console.error(`[NETWORK/CORS ERROR] Loading section ${section.href}: ${error.message}`);
             throw new Error(`Network/CORS error loading section: ${error.message}`);
        }
         console.error(`[LOAD ERROR] Section ${section.href}: ${error.message}`, error);
        throw new Error(`Failed to load section content: ${error?.message || error}`);
    }
}

/**
 * Parses the HTML content of a loaded section to extract text.
 * @param contents - The loaded section contents (Document or string).
 * @param href - The href of the section for logging.
 * @returns The extracted text content as a string.
 */
function parseSectionContents(contents: Document | string | HTMLElement, href: string): string {
    let bodyElement: HTMLElement | null = null;

    try {
        if (typeof contents === 'string') {
            // console.log(`[DEBUG] Section ${href} loaded as string.`);
            const parser = new DOMParser();
            let doc = parser.parseFromString(contents, 'application/xhtml+xml');
            // Check for parsing errors specific to XML parsing
             const parserError = doc.querySelector('parsererror');
             if (parserError || doc.documentElement.nodeName === 'parsererror') {
                console.warn(`[WARN] Failed to parse ${href} as XHTML, trying HTML.`);
                doc = parser.parseFromString(contents, 'text/html');
             }
            bodyElement = doc.body;
        } else if (contents instanceof Document) {
            // console.log(`[DEBUG] Section ${href} loaded as Document.`);
            bodyElement = contents.body;
        } else if (contents instanceof HTMLElement && contents.tagName.toUpperCase() === 'BODY') {
            // console.log(`[DEBUG] Section ${href} loaded as BODY HTMLElement.`);
            bodyElement = contents;
         } else if (contents instanceof HTMLElement) { // Handle SVGs or other non-body elements gracefully
             console.log(`[DEBUG] Section ${href} loaded as non-BODY HTMLElement (${contents.tagName}). Attempting to extract text directly.`);
             // Attempt to extract text directly from the element if it's not a standard document/body
             const directText = extractTextRecursive(contents);
             if (directText.trim()) {
                 console.log(`[DEBUG] Extracted ${directText.trim().length} chars directly from ${href}`);
                 return directText;
             } else {
                 console.warn(`[WARN] HTMLElement (${contents.tagName}) for ${href} yielded no direct text.`);
                 // Optionally, try finding a body within it, though less likely
                 bodyElement = contents.querySelector('body');
             }
        } else {
            console.warn(`[WARN] Section ${href} loaded with unexpected type: ${typeof contents}, constructor: ${contents?.constructor?.name}`);
        }

        if (!bodyElement) {
             // Don't throw, just return empty string for sections without a body or direct text
            console.warn(`[WARN] Could not find or access body element in section ${href}. Returning empty text for this section.`);
            return '';
        }

        // console.log(`[DEBUG] Processing body of ${href}. Body outerHTML length: ${bodyElement.outerHTML?.length || 'N/A'}`);
        const sectionText = extractTextRecursive(bodyElement);

        if (!sectionText.trim()) {
            // console.warn(`[WARN] Section parsing yielded no text (href: ${href}). Body might be empty or non-textual.`);
        } else {
            // console.log(`[DEBUG] Extracted ${sectionText.trim().length} chars from ${href}`);
        }
        return sectionText;
    } catch (parseError: any) {
        console.error(`[PARSE ERROR] Section ${href}: ${parseError.message}`, parseError);
        throw new Error(`Failed to parse section content: ${parseError?.message || parseError}`);
    }
}

/**
 * Loads and parses a single EPUB spine item. Catches errors for the specific section.
 * @param item - The spine item descriptor.
 * @param state - The current processing state object.
 * @returns A promise that resolves when the section is processed (doesn't return text directly).
 */
async function loadAndParseSection(item: SpineItem, state: EpubProcessingState): Promise<void> {
    if (!state.book) return; // Should not happen if called correctly

    let section: Section | undefined;
    try {
        // console.log(`[DEBUG] Getting section object (href: ${item.href}, idref: ${item.idref})...`);
        section = state.book.spine.get(item) as Section | undefined;

        if (!section) {
            throw new Error(`Section object not found in spine (href: ${item.href}).`);
        }

        // console.log(`[DEBUG] Loading section content (href: ${item.href})...`);
        const contents = await loadSectionContents(section, state.book);
        const text = parseSectionContents(contents, item.href);
        state.sectionTexts.push(text.trim()); // Add trimmed text

    } catch (sectionError: any) {
        console.error(`[ERROR] Error processing section (href: ${item.href}):`, sectionError.message || sectionError, sectionError.stack?.substring(0, 300));
        state.sectionErrors++;
        // Optionally push an error marker or empty string
        // state.sectionTexts.push('');

        // Attempt to unload the specific section (best effort cleanup)
        if (section && typeof section.unload === 'function') {
            try { section.unload(); } catch (unloadErr) { console.warn(`[WARN] Failed to unload section ${item.href}:`, unloadErr); }
        }
        // Do not re-throw here, let the loop continue
    }
}

/**
 * Iterates through the EPUB spine, loading and parsing each section.
 * @param state - The processing state object.
 */
async function processSpineItems(state: EpubProcessingState): Promise<void> {
    if (!state.book) return;
    state.totalSections = state.book.spine.items.length;

    if (state.totalSections === 0) {
        console.warn("[WARN] EPUB spine contains no items.", state.book.spine);
        return; // Nothing to process
    }

    console.log(`[INFO] Processing ${state.totalSections} spine items...`);

    // Process sections sequentially to avoid overwhelming epubjs or the browser
    for (const item of state.book.spine.items) {
        await loadAndParseSection(item, state);
    }

    console.log(`[INFO] Finished processing sections. Errors: ${state.sectionErrors}/${state.totalSections}.`);
}

/**
 * Normalizes and joins the extracted text from all sections.
 * @param sectionTexts - An array of strings, each representing the text of a section.
 * @returns The normalized full text content as a single string.
 */
function normalizeAndJoinText(sectionTexts: string[]): string {
    if (!sectionTexts || sectionTexts.length === 0) return '';

    // console.log(`[DEBUG] Joining ${sectionTexts.length} section text chunks.`);
    let fullText = sectionTexts
        .map(text => text.replace(/\r\n/g, '\n')) // Normalize line endings before joining
        .filter(Boolean) // Remove empty strings resulting from failed sections
        .join('\n\n'); // Join non-empty sections with double newline

    // console.log(`[DEBUG] Text length after joining: ${fullText.length}`);

    // More robust normalization
    fullText = fullText
        .split('\n')                  // Split into lines
        .map(line => line.trim())     // Trim whitespace from each line
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n')                   // Re-join lines with single newline
        .replace(/[ \t]{2,}/g, ' ')    // Replace multiple spaces/tabs with single space
        .replace(/(\n){3,}/g, '\n\n'); // Reduce 3+ newlines to 2

    console.log(`[INFO] Total extracted text length after normalization: ${fullText.length}`);
    return fullText;
}

/**
 * Handles the successful resolution or rejection based on the processing results.
 * @param state - The final processing state.
 * @param toast - The toast function.
 * @param resolve - The promise resolve function.
 * @param reject - The promise reject function.
 */
function finalizeProcessing(
    state: EpubProcessingState,
    toast: ToastFunction,
    resolve: (value: string | PromiseLike<string>) => void,
    reject: (reason?: any) => void
): void {
    const fullText = normalizeAndJoinText(state.sectionTexts);

    if (fullText.length > 0) {
        if (state.sectionErrors > 0) {
            toast({
                title: 'EPUB Parsed with Warnings',
                description: `Processed ${state.totalSections} sections, but ${state.sectionErrors} failed. Content may be missing.`,
                variant: 'destructive', // Use warning/destructive style
                duration: 8000,
            });
        } else {
            console.log("[INFO] EPUB parsing successful.");
        }
        resolve(fullText);
    } else {
        // Determine the specific error message based on the state
        let errorMsg: string;
        if (state.totalSections === 0) {
            errorMsg = "EPUB file has no content sections in its spine.";
        } else if (state.sectionErrors === state.totalSections) {
            errorMsg = `Failed to extract any text. All ${state.totalSections} sections failed to load or parse. Check for DRM or file corruption.`;
        } else {
            errorMsg = "EPUB processing yielded no text. File might be empty, image-based, non-standard, or DRM protected.";
        }
        console.error(`[ERROR] ${errorMsg}`);
        reject(new Error(errorMsg)); // Reject the promise with an Error object
    }
}


/**
 * Handles critical errors during EPUB initialization or processing.
 * @param err - The error object.
 * @param state - The processing state (for cleanup).
 * @param reject - The promise reject function.
 */
function handleCriticalError(
    err: any,
    state: EpubProcessingState,
    reject: (reason?: any) => void
): void {
    console.error("[CRITICAL] EPUB Processing Error:", err, err.stack);

    let errorMessage = "Error parsing EPUB file.";
    if (isLikelyDrmError(err)) errorMessage += " This file might be DRM-protected.";
    else if (err.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format (not a valid zip).";
    else if (err.message?.includes('missing central directory')) errorMessage += " Invalid EPUB format (corrupted zip).";
    else if (err.message?.includes('timeout') || err.name === 'TimeoutError') errorMessage += " Processing timed out.";
    else if (err.message) errorMessage += ` Details: ${err.message}`;
    else if (err instanceof Error) errorMessage += ` Details: ${err.message}`;
    else errorMessage += " An unexpected error occurred during processing.";

    // Ensure book error listener is removed
    if (state.book && typeof state.book.off === 'function' && state.bookErrorListener) {
        state.book.off('book:error', state.bookErrorListener);
        state.bookErrorListener = null; // Prevent double removal in finally
    }

    reject(new Error(errorMessage)); // Reject with an Error object
}

/**
 * Cleans up resources like the book instance and toast.
 * @param state - The processing state.
 * @param toastId - The ID of the loading toast.
 * @param dismiss - The function to dismiss toasts.
 */
function cleanupResources(
    state: EpubProcessingState,
    toastId: string | undefined,
    dismiss: DismissFunction
): void {
    // Ensure toast is dismissed
    if (toastId) {
        dismiss(toastId);
        state.toastCtrl = null; // Clear the reference
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

    // Ensure the error listener is removed if it hasn't been already
    if (state.book && typeof state.book.off === 'function' && state.bookErrorListener) {
        state.book.off('book:error', state.bookErrorListener);
    }
}


/**
 * Parses an EPUB file, extracting its text content.
 *
 * @param fileOrPath Either a File object or a string representing a path to the EPUB file.
 * @param toast - Function to display toast notifications.
 * @param dismiss - Function to dismiss toast notifications.
 * @returns A promise that resolves with the extracted text content or rejects with an error.
 */
export const parseEpub = async (
    fileOrPath: File | string,
    toast: ToastFunction,
    dismiss: DismissFunction
): Promise<string> => {
    const Epub = (await import('epubjs')).default;
    const fileName = typeof fileOrPath === 'string' ? 'test.epub' : fileOrPath.name;
    let arrayBuffer: ArrayBuffer;

    // State object to manage processing details
    const state: EpubProcessingState = {
        book: null,
        toastCtrl: null,
        bookErrorListener: null,
        sectionTexts: [],
        sectionErrors: 0,
        totalSections: 0,
    };

    let toastId: string | undefined;

    try {
        // Prepare ArrayBuffer
        if (typeof fileOrPath === 'string') {
            const response = await fetch(fileOrPath);
            if (!response.ok) throw new Error(`Failed to fetch EPUB from path: ${response.statusText}`);
            arrayBuffer = await response.arrayBuffer();
        } else {
            arrayBuffer = await fileOrPath.arrayBuffer();
        }

        // Show loading toast
        state.toastCtrl = toast({
            title: 'Loading EPUB...',
            description: `Processing ${fileName}`
        });
        toastId = state.toastCtrl?.id; // Store ID for potential dismissal

        // Initialize Book and setup error handling
        state.book = Epub(arrayBuffer);
        state.bookErrorListener = (err: any) => {
            // Throw the error to be caught by the main try...catch block
            throw err;
        };
        state.book.on('book:error', state.bookErrorListener);
        state.book.on('error', (err: any) => console.warn("epubjs generic error event:", err)); // Optional: for generic errors

        // Wait for book readiness
        await state.book.ready;
        console.log("[INFO] Book ready. Metadata:", state.book.metadata);

        // Process spine items sequentially
        await processSpineItems(state);

        // Resolve or reject based on results
        return await new Promise((resolve, reject) => {
             finalizeProcessing(state, toast, resolve, reject);
        });

    } catch (err: any) {
        // Handle critical errors that occurred during setup or processing
        return await new Promise((_, reject) => {
             handleCriticalError(err, state, reject);
        });
    } finally {
        // Cleanup regardless of success or failure
        cleanupResources(state, toastId, dismiss);
    }
};

// Note: Ensure 'epubjs' is installed: npm install epubjs
//       Make sure epubParsingUtils.ts contains the helper functions.
