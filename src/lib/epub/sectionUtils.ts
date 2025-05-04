
import type { Book, SpineItem } from 'epubjs';
import type Section from 'epubjs/types/section';
import { extractTextRecursive } from '@/lib/epubParsingUtils';
import type { EpubProcessingState } from './types';


/**
 * Loads the content of a single EPUB section.
 * Epubjs v0.3.x uses section.load() which returns a promise resolving to the contents (Document or string).
 * @param section - The epubjs Section object.
 * @param book - The epubjs Book instance (used potentially for request context in some epubjs versions/setups, though often `section.load()` is sufficient).
 * @returns A promise resolving to the loaded section contents (Document or string or potentially HTMLElement).
 * @throws Error if loading fails.
 */
async function loadSectionContents(section: Section, book: Book): Promise<Document | string | HTMLElement> {
    try {
        // section.load() internally uses the book's request mechanism if needed.
        const contents = await section.load();
        if (contents === undefined || contents === null) { // Check for undefined as well
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
 * Parses the HTML/XHTML content of a loaded section to extract text.
 * This version avoids using epubjs rendering methods like `render()` or `replaceCss`.
 * @param contents - The loaded section contents (Document, string, or HTMLElement).
 * @param href - The href of the section for logging.
 * @returns The extracted text content as a string.
 * @throws Error if parsing fails critically.
 */
function parseSectionContents(contents: Document | string | HTMLElement, href: string): string {
    let bodyElement: HTMLElement | null = null;

    try {
        if (typeof contents === 'string') {
            const parser = new DOMParser();
            let doc = parser.parseFromString(contents, 'application/xhtml+xml');
             const parserError = doc.querySelector('parsererror');
             // Check if parsing failed or resulted in an error document
             if (parserError || !doc || doc.documentElement.nodeName === 'parsererror') {
                console.warn(`[WARN] Failed to parse ${href} as XHTML, trying HTML.`);
                doc = parser.parseFromString(contents, 'text/html');
             }
             // Check again after attempting HTML parsing
             if (!doc || doc.documentElement.nodeName === 'parsererror') {
                 console.error(`[PARSE ERROR] Failed to parse ${href} even as HTML.`);
                 return ''; // Return empty if both attempts fail
             }

            bodyElement = doc.body;
        } else if (contents instanceof Document) {
            bodyElement = contents.body;
        } else if (contents instanceof HTMLElement && contents.tagName.toUpperCase() === 'BODY') {
            bodyElement = contents;
         } else if (contents instanceof HTMLElement) {
             // If we got an element that's not the body, try finding body within it,
             // or extract text directly as a fallback.
             bodyElement = contents.querySelector('body');
             if (!bodyElement) {
                 console.warn(`[WARN] Loaded HTMLElement (${contents.tagName}) for ${href} is not body and contains no body. Extracting text directly.`);
                 return extractTextRecursive(contents); // Extract text directly from the element
             }
        } else {
            console.warn(`[WARN] Section ${href} loaded with unexpected type: ${typeof contents}, constructor: ${contents?.constructor?.name}`);
        }

        if (!bodyElement) {
            console.warn(`[WARN] Could not find or determine body element in section ${href}. Returning empty text for this section.`);
            return '';
        }

        // Extract text recursively from the determined body element
        const sectionText = extractTextRecursive(bodyElement);

        if (!sectionText.trim()) {
            // console.warn(`[WARN] Section parsing yielded no text (href: ${href}). Body might be empty or non-textual.`);
        }
        return sectionText;
    } catch (parseError: any) {
        console.error(`[PARSE ERROR] Section ${href}: ${parseError.message}`, parseError);
        // Don't throw, just return empty string to allow processing other sections
        return `[SECTION PARSE ERROR: ${href}]`;
    }
}

/**
 * Loads and parses a single EPUB spine item. Catches errors for the specific section.
 * Updates the processing state with the extracted text or marks an error.
 * @param item - The spine item descriptor.
 * @param state - The current processing state object.
 * @returns A promise that resolves when the section is processed.
 */
async function loadAndParseSection(item: SpineItem, state: EpubProcessingState): Promise<void> {
    if (!state.book) {
        console.warn("[WARN] Attempted to load section without a book instance.");
        state.sectionErrors++;
        state.sectionTexts.push(`[BOOK INSTANCE ERROR]`);
        return;
    }

    let section: Section | undefined;
    let sectionText = ''; // Default to empty string

    try {
        section = state.book.spine.get(item) as Section | undefined; // Use spine.get() which is standard

        if (!section) {
            throw new Error(`Section object not found in spine (href: ${item.href}). Check OPF spine definition.`);
        }

        const contents = await loadSectionContents(section, state.book);
        sectionText = parseSectionContents(contents, item.href);

    } catch (sectionError: any) {
         // Log more specific error details if available
         console.error(`[ERROR] Processing section (href: ${item.href}): ${sectionError.message || sectionError}`, sectionError.stack?.substring(0, 300));
        state.sectionErrors++;
        // Push an error marker for debugging, but let finalizeProcessing handle user message
        sectionText = `[SECTION LOAD/PARSE ERROR: ${item.href}]`;

        // Attempt to unload the specific section if it exists (best effort cleanup)
        if (section && typeof section.unload === 'function') {
            try { section.unload(); } catch (unloadErr) { console.warn(`[WARN] Failed to unload section ${item.href}:`, unloadErr); }
        }
    } finally {
        // Always push the result (text or error marker)
        // Normalize spaces within the section text before pushing
        const normalizedSectionText = sectionText.replace(/\s+/g, ' ').trim();
        state.sectionTexts.push(normalizedSectionText);
    }
}

/**
 * Iterates through the EPUB spine, loading and parsing each section sequentially.
 * @param state - The processing state object.
 * @returns Promise that resolves when all sections are processed.
 */
export async function processSpineItems(state: EpubProcessingState): Promise<void> {
    if (!state.book?.spine?.items) {
        console.warn("[WARN] Book spine or spine items not available for processing.");
        state.totalSections = 0;
        return; // Nothing to process
    }

    state.totalSections = state.book.spine.items.length;

    if (state.totalSections === 0) {
        console.warn("[WARN] EPUB spine contains no items.", state.book.spine);
        return; // Nothing to process
    }

    console.log(`[INFO] Processing ${state.totalSections} spine items sequentially...`);

    // Process sequentially to potentially manage memory better
    for (const item of state.book.spine.items) {
         // Add a small delay between sections if needed, e.g., await new Promise(res => setTimeout(res, 10));
        await loadAndParseSection(item, state);
    }


    console.log(`[INFO] Finished processing all sections. Errors encountered: ${state.sectionErrors}/${state.totalSections}.`);
}
