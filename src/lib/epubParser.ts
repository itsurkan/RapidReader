
import type { Book } from 'epubjs';
import type Section from 'epubjs/types/section';

// Helper function to check if an error might be related to DRM
export function isLikelyDrmError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  // Keywords often associated with DRM issues in epubjs or related contexts
  return message.includes('encrypted') || message.includes('decryption') || message.includes('content protection');
}

// Refined recursive function to extract text, simplifying spacing logic and adding paragraph breaks
const extractTextRecursive = (node: Node | null): string => {
    if (!node) return '';

    // Skip comment, script, and style nodes entirely
    if (node.nodeType === Node.COMMENT_NODE || node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') {
        return '';
    }

    if (node.nodeType === Node.TEXT_NODE) {
        // Return the text content directly; parent/post-processing handles spacing
        return node.textContent || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toUpperCase();
        // More comprehensive list of block-level elements
        const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'TH', 'TD', 'DL', 'DT', 'DD', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'UL', 'OL', 'BODY', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'FIELDSET', 'FORM'].includes(tagName);
        const isLineBreak = tagName === 'BR';

        let currentText = '';

        for (let i = 0; i < node.childNodes.length; i++) {
            currentText += extractTextRecursive(node.childNodes[i]); // Recursive call
        }

        // Add paragraph breaks *after* processing children for block elements or line breaks
        if (isBlock || isLineBreak) {
             currentText += '\n\n'; // Add double newline after block/br
        } else {
             // Add a single space after inline elements if they contain text,
             // to prevent words from merging. Let later normalization handle excess space.
             // Check if the current node actually produced text and doesn't already end in whitespace.
             if (currentText.length > 0 && !/\s$/.test(currentText)) {
                 currentText += ' ';
             }
        }
        return currentText;
    }

    // For other node types, return empty string
    return '';
};


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
    toast: (options: any) => { id: string; dismiss: () => void; update: (props: any) => void; },
    dismiss: (id: string) => void
): Promise<string> => {
    const Epub = (await import('epubjs')).default;
    let book: Book | null = null; // Use Book type
    let toastCtrl: ReturnType<typeof toast> | null = null;
    let arrayBuffer: ArrayBuffer;
    const fileName = typeof fileOrPath === 'string' ? 'test.epub' : fileOrPath.name; // Determine filename for messages

    // Handle File object or string path
    if (typeof fileOrPath === 'string') {
        // Handle string path (e.g., for test file)
        try {
            const response = await fetch(fileOrPath);
            if (!response.ok) throw new Error(`Failed to fetch EPUB from path: ${response.statusText}`);
            arrayBuffer = await response.arrayBuffer();
        } catch (fetchError) {
            console.error("Error fetching EPUB from path:", fetchError);
            throw fetchError;
        }
    } else {
        // Handle File object
        arrayBuffer = await fileOrPath.arrayBuffer();
    }

    toastCtrl = toast({
        title: 'Loading EPUB...',
        description: `Processing ${fileName}`
    });
    const toastId = toastCtrl?.id;


    return new Promise(async (resolve, reject) => {
        try {
            book = Epub(arrayBuffer); // Initialize the book

            // Error handling setup
            const bookErrorListener = (err: any) => {
                console.error('EPUB Book Error Event:', err);
                reject(err); // Reject the promise on book error
            };
            book.on('book:error', bookErrorListener);
            book.on('error', (err: any) => {
                 console.error("epubjs generic error event:", err);
                 // Consider rejecting here too, depending on severity
            });


            // Wait for the book metadata and spine to be ready
            await book.ready;
            console.log("book.ready resolved. Metadata:", book.metadata);
            console.log(`Processing ${book.spine.items.length} spine items...`);

            let fullText = '';
            let sectionErrors = 0;
            const totalSections = book.spine.items.length;
            if (totalSections === 0) {
                console.warn("EPUB spine contains no items.", book.spine);
            }

            const sectionTexts: string[] = [];

            // Iterate through spine items using a standard for...of loop
            for (const item of book.spine.items) {
                let sectionText = '';
                let section: Section | undefined; // Define section variable here
                try {
                    console.log(`[DEBUG] Loading section (href: ${item.href}, idref: ${item.idref})...`);

                    // Get the section object first
                    section = book.spine.get(item) as Section | undefined; // Cast needed?

                    if (!section) {
                        console.warn(`[WARN] Section object not found in spine (href: ${item.href}).`);
                        sectionErrors++;
                        continue; // Skip to the next item
                    }

                    // Use section.load() to get the contents (returns a Document or string based on type)
                    // Then parse the HTML content. Pass the book's loader.
                    const contents = await section.load(book.load.bind(book));
                    let bodyElement: HTMLElement | null = null;

                    if (typeof contents === 'string') {
                         console.log(`[DEBUG] Section ${item.href} loaded as string.`);
                         const parser = new DOMParser();
                         // Attempt to parse as XHTML first, then HTML as fallback
                         let doc = parser.parseFromString(contents, 'application/xhtml+xml');
                         // Check if parsing failed (common for invalid XML)
                         if (doc.getElementsByTagName("parsererror").length > 0) {
                             console.warn(`[WARN] Failed to parse ${item.href} as XHTML, trying HTML.`);
                             doc = parser.parseFromString(contents, 'text/html');
                         }
                         bodyElement = doc.body;

                    } else if (contents instanceof Document) { // If it's already a Document
                        console.log(`[DEBUG] Section ${item.href} loaded as Document.`);
                        bodyElement = contents.body;
                    } else if (contents instanceof HTMLElement && contents.tagName === 'BODY') { // If it's the body element itself
                        console.log(`[DEBUG] Section ${item.href} loaded as BODY HTMLElement.`);
                        bodyElement = contents;
                    } else if (contents instanceof HTMLElement) { // If it's some other element, try finding body within
                        console.log(`[DEBUG] Section ${item.href} loaded as other HTMLElement (${contents.tagName}). Searching for body.`);
                        bodyElement = contents.querySelector('body');
                    } else {
                         console.warn(`[WARN] Section ${item.href} loaded with unexpected type: ${typeof contents}`);
                    }


                    if (bodyElement) {
                        console.log(`[DEBUG] Processing body of ${item.href}. Body outerHTML length: ${bodyElement.outerHTML?.length || 'N/A'}`);
                        // console.log(`[DEBUG] Body innerHTML sample: ${bodyElement.innerHTML?.substring(0, 200) || 'N/A'}`); // Use with caution
                        sectionText = extractTextRecursive(bodyElement);
                        if (!sectionText.trim()) { // Check trimmed text
                             console.warn(`[WARN] Section parsing yielded no text (href: ${item.href}). Body might be empty or non-textual.`);
                             // if (bodyElement.textContent?.trim()) {
                             //     console.warn(`[DEBUG] Text found via textContent but not extractTextRecursive for ${item.href}. Sample: ${bodyElement.textContent.substring(0, 100)}`);
                             // }
                        } else {
                            console.log(`[DEBUG] Extracted ${sectionText.trim().length} chars from ${item.href}`);
                        }
                    } else {
                        console.warn(`[WARN] Skipping section due to missing or inaccessible body element after loading (href: ${item.href}).`);
                        sectionErrors++;
                    }
                } catch (sectionError: any) {
                    console.error(`[ERROR] Error processing section (href: ${item.href}):`, sectionError.message || sectionError, sectionError.stack);
                    sectionErrors++;

                    // Attempt to unload the specific section if epubjs supports it (v0.3 might not directly)
                    // This is more of a theoretical cleanup step in v0.3
                    if (section && typeof section.unload === 'function') {
                        try { section.unload(); } catch (unloadErr) { console.warn(`[WARN] Failed to unload section ${item.href}:`, unloadErr); }
                    }
                }

                sectionTexts.push(sectionText); // Keep original spacing from recursive fn for now
            }

             // Join with single newlines (recursive fn adds double), then normalize
             fullText = sectionTexts.filter(Boolean).join('\n');
             // Normalize excessive newlines and leading/trailing whitespace per line, then multiple spaces
             fullText = fullText
                 .split('\n')
                 .map(line => line.trim()) // Trim each line first
                 .filter(line => line.length > 0) // Remove empty lines
                 .join('\n') // Rejoin with single newlines
                 .replace(/ {2,}/g, ' ') // Normalize multiple spaces within lines
                 .replace(/(\n){3,}/g, '\n\n'); // Normalize multiple newlines to double newlines


            console.log(`[INFO] Processed ${totalSections} sections with ${sectionErrors} errors.`);
            console.log(`[INFO] Total extracted text length after normalization: ${fullText.length}`);

            // Remove error listener *before* resolving/rejecting to avoid potential duplicate errors
             if (book && typeof book.off === 'function') {
                 book.off('book:error', bookErrorListener);
             }


            if (sectionErrors > 0) {
                console.warn(`[WARN] EPUB had ${sectionErrors} section parsing errors.`);
            }

            if (fullText.length === 0 && totalSections > 0) {
                const errorMsg = sectionErrors === totalSections ?
                    `Failed to extract any text. All ${totalSections} sections failed to load or parse. Check for DRM or file corruption.` :
                    "EPUB processing yielded no text. File might be empty, image-based, non-standard, or DRM protected.";
                console.error(`[ERROR] ${errorMsg}`); // Add error level logging
                reject(new Error(errorMsg));
            } else if (fullText.length === 0 && totalSections === 0) {
                 console.error("[ERROR] EPUB file has no content sections in its spine.");
                 reject(new Error("EPUB file has no content sections in its spine."));
            } else {
                if (sectionErrors > 0) {
                     toast({
                         title: 'Parsing Warning',
                         description: `EPUB parsed with ${sectionErrors} error(s). Some content might be missing or improperly formatted.`,
                         variant: 'destructive', // Using destructive for visibility
                         duration: 7000,
                     });
                } else {
                    console.log("[INFO] EPUB parsing successful.");
                }
                resolve(fullText);
            }
         } catch (err: any) {
            console.error("[CRITICAL] Critical EPUB Processing Error:", err, err.stack) // Log stack
                  let errorMessage = "Error parsing EPUB file.";
                    if (isLikelyDrmError(err)) errorMessage += " This file might be DRM-protected.";
                    else if (err.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format (not a valid zip).";
                    else if (err.message?.includes('missing central directory')) errorMessage += " Invalid EPUB format (corrupted zip).";
                    else if (err.message?.includes('timeout') || err.name === 'TimeoutError') errorMessage += " Processing timed out.";
                    else if (err.message) errorMessage += ` Details: ${err.message}`;
                    else if (err instanceof Error) errorMessage += ` Details: ${err.message}`;
                    else errorMessage += " An unexpected error occurred during processing.";

                    // Remove error listener on critical error as well
                     if (book && typeof book.off === 'function') {
                        book.off('book:error', bookErrorListener);
                     }

                    reject(new Error(errorMessage));
        } finally {

            // Ensure toast is dismissed regardless of success or failure
            if (toastId && toastCtrl?.id === toastId) {
                dismiss(toastId);
            } else if (toastId) {
                 // If the ref ID doesn't match (e.g., due to subsequent toasts), try dismissing by ID anyway
                 dismiss(toastId);
            }

            if (book && typeof book.destroy === 'function') {
                try { book.destroy(); console.log("[INFO] EPUB book instance destroyed."); }
                catch (destroyError) { console.warn("[WARN] Error destroying book instance:", destroyError); }
            } else if (book) {
                 console.warn('[WARN] Book instance is present but the destroy function is not defined or accessible.');
            }
        }
    });
};

    