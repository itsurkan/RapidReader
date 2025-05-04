import type { Book, SpineItem } from 'epubjs';
import type Section from 'epubjs/types/section';
import { extractTextRecursive } from '@/lib/epubParsingUtils';
import type { EpubProcessingState } from './types';


/**
 * Loads the content of a single EPUB section.
 * @param section - The epubjs Section object.
 * @param book - The epubjs Book instance.
 * @returns A promise resolving to the loaded section contents (Document or string).
 * @throws Error if loading fails.
 */
async function loadSectionContents(section: Section, book: Book): Promise<Document | string | HTMLElement> {
    try {
        // Epubjs v0.3.x uses section.load(book.request.bind(book)) or similar depending on request method
        // Assuming book.load exists and handles the request mechanism
        // Use section.load() which returns a promise resolving to the contents
        const contents = await section.load();
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
             if (parserError || doc.documentElement.nodeName === 'parsererror') {
                console.warn(`[WARN] Failed to parse ${href} as XHTML, trying HTML.`);
                doc = parser.parseFromString(contents, 'text/html');
             }
            bodyElement = doc.body;
        } else if (contents instanceof Document) {
            bodyElement = contents.body;
        } else if (contents instanceof HTMLElement && contents.tagName.toUpperCase() === 'BODY') {
            bodyElement = contents;
         } else if (contents instanceof HTMLElement) {
             const directText = extractTextRecursive(contents);
             if (directText.trim()) {
                 return directText;
             } else {
                 console.warn(`[WARN] HTMLElement (${contents.tagName}) for ${href} yielded no direct text.`);
                 bodyElement = contents.querySelector('body');
             }
        } else {
            console.warn(`[WARN] Section ${href} loaded with unexpected type: ${typeof contents}, constructor: ${contents?.constructor?.name}`);
        }

        if (!bodyElement) {
            console.warn(`[WARN] Could not find or access body element in section ${href}. Returning empty text for this section.`);
            return '';
        }

        const sectionText = extractTextRecursive(bodyElement);

        if (!sectionText.trim()) {
            // console.warn(`[WARN] Section parsing yielded no text (href: ${href}). Body might be empty or non-textual.`);
        }
        return sectionText;
    } catch (parseError: any) {
        console.error(`[PARSE ERROR] Section ${href}: ${parseError.message}`, parseError);
        throw new Error(`Failed to parse section content: ${parseError?.message || parseError}`);
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
    if (!state.book) return;

    let section: Section | undefined;
    let sectionText = ''; // Default to empty string

    try {
        section = state.book.spine.get(item) as Section | undefined;

        if (!section) {
            throw new Error(`Section object not found in spine (href: ${item.href}).`);
        }

        const contents = await loadSectionContents(section, state.book);
        sectionText = parseSectionContents(contents, item.href);

    } catch (sectionError: any) {
        console.error(`[ERROR] Error processing section (href: ${item.href}):`, sectionError.message || sectionError, sectionError.stack?.substring(0, 300));
        state.sectionErrors++;
        // Optionally push an error marker instead of empty string if needed for debugging
        // sectionText = `[SECTION ERROR: ${item.href}]`;

        // Attempt to unload the specific section (best effort cleanup)
        if (section && typeof section.unload === 'function') {
            try { section.unload(); } catch (unloadErr) { console.warn(`[WARN] Failed to unload section ${item.href}:`, unloadErr); }
        }
        // Do not re-throw here, let the loop continue, push empty/marker text
    } finally {
        // Always push the result (text or empty/marker)
        state.sectionTexts.push(sectionText.trim());
    }
}

/**
 * Iterates through the EPUB spine, loading and parsing each section sequentially.
 * @param state - The processing state object.
 * @returns Promise that resolves when all sections are processed.
 */
export async function processSpineItems(state: EpubProcessingState): Promise<void> {
    if (!state.book) return;
    state.totalSections = state.book.spine.items.length;

    if (state.totalSections === 0) {
        console.warn("[WARN] EPUB spine contains no items.", state.book.spine);
        return; // Nothing to process
    }

    console.log(`[INFO] Processing ${state.totalSections} spine items...`);

    for (const item of state.book.spine.items) {
        await loadAndParseSection(item, state);
    }

    console.log(`[INFO] Finished processing sections. Errors: ${state.sectionErrors}/${state.totalSections}.`);
}
