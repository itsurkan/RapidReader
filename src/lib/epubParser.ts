
import type { Book } from 'epubjs';
import type Section from 'epubjs/types/section';

// Helper function to check if an error might be related to DRM
export function isLikelyDrmError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  // Keywords often associated with DRM issues in epubjs or related contexts
  return message.includes('encrypted') || message.includes('decryption') || message.includes('content protection');
}

// Simplified recursive function to extract text, adding paragraph breaks
const extractTextRecursive = (node: Node | null): string => {
    let currentText = '';
    if (!node) return '';

    // Skip comment, script, and style nodes entirely
    if (node.nodeType === Node.COMMENT_NODE || node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') {
        return '';
    }

    if (node.nodeType === Node.TEXT_NODE) {
        const trimmed = node.textContent?.trim();
        if (trimmed) {
            currentText += trimmed;
        }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toUpperCase();
        // More comprehensive list of block-level elements for paragraph breaks
        const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'TH', 'TD', 'DL', 'DT', 'DD', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'UL', 'OL', 'BODY', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'FIELDSET', 'FORM'].includes(tagName);
        const isLineBreak = tagName === 'BR';
        const isListItem = tagName === 'LI';

        // Add double newline *before* processing children of a block element, if needed
        // Exception: Don't add extra space before LI if it's the first content after UL/OL start
        const needsPrefixBreak = isBlock && currentText.length > 0 && !currentText.endsWith('\n\n') && !currentText.endsWith('\n');
        if (needsPrefixBreak && !(isListItem && currentText.endsWith('\n'))) {
             currentText += '\n\n';
        } else if (needsPrefixBreak) {
            // Avoid double \n\n if previous was also a block
            currentText += '\n';
        }


        for (let i = 0; i < node.childNodes.length; i++) {
            const childNode = node.childNodes[i];
            const childText = extractTextRecursive(childNode); // Recursive call

            if (childText) {
                // Add space *before* child text if the current text exists, doesn't end with space/newline,
                // AND the child text doesn't start with space/newline/punctuation.
                 if (currentText.length > 0 && !/[\s\n]$/.test(currentText) && !/^[\s\n.,!?;:)\]}'"”‘-]/.test(childText) && !/^[(\[{'"“‘]/.test(currentText.slice(-1))) {
                     currentText += ' ';
                 }
                currentText += childText;
            }
        }

        // Add double newline *after* processing children of a block element or BR, if needed
        const needsSuffixBreak = (isBlock || isLineBreak) && currentText.length > 0 && !currentText.endsWith('\n');
         if (needsSuffixBreak) {
             currentText += '\n\n';
         }
    }
    return currentText;
};

export const parseEpub = async (
    file: File,
    toast: (options: any) => { id: string; dismiss: () => void; update: (props: any) => void; },
    dismiss: (id: string) => void
): Promise<string> => {
    const Epub = (await import('epubjs')).default;
    let book: any | null = null; // Use 'any' temporarily if types are uncertain
    let toastCtrl: ReturnType<typeof toast> | null = null;

    toastCtrl = toast({
        title: 'Loading EPUB...',
        description: `Processing ${file.name}`
    });
    const toastId = toastCtrl?.id;

    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            book = Epub(arrayBuffer); // Initialize the book

            book.on('book:error', (err: any) => {
                console.error('EPUB Book Error Event:', err);
                reject(err); // Reject the promise on book error
            });
            book.on('error', (err: any) => {
                 console.error("epubjs generic error event:", err);
                 // Consider rejecting here too, depending on severity
            });


            // Wait for the book metadata and spine to be ready
            await book.ready;
            console.log("book.ready resolved. Metadata:", book.metadata);
            console.log("Processing spine items...");

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
                try {
                    console.log(`Loading section (href: ${item.href}, idref: ${item.idref})...`);

                    // Correct way to load a section using epubjs v0.3.x
                    const section: Section | undefined = await book.spine.get(item);

                    if (!section) {
                        console.warn(`Section not loaded or undefined (href: ${item.href})`);
                        sectionErrors++;
                        continue; // Skip to the next item
                    }

                    // Use section.load() to get the contents (returns a Document or string based on type)
                    // Then parse the HTML content.
                    const contents = await section.load(book.load.bind(book)); // Need to pass book.load for resource fetching
                    let bodyElement: HTMLElement | null = null;

                    if (typeof contents === 'string') {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(contents, section.mediaType || 'application/xhtml+xml');
                        bodyElement = doc.body;
                    } else if (contents instanceof Document) { // If it's already a Document
                        bodyElement = contents.body;
                    } else if (contents instanceof HTMLElement && contents.tagName === 'BODY') { // If it's the body element itself
                        bodyElement = contents;
                    } else if (contents instanceof HTMLElement) { // If it's some other element, try finding body within
                         bodyElement = contents.querySelector('body');
                    }


                    if (bodyElement) {
                        sectionText = extractTextRecursive(bodyElement);
                        if (!sectionText) {
                             console.warn(`Section parsing yielded no text (href: ${item.href}). Content might be non-textual.`);
                        }
                    } else {
                        console.warn(`Skipping section due to missing or inaccessible body element after loading (href: ${item.href}).`);
                        sectionErrors++;
                    }
                } catch (sectionError: any) {
                    console.error(`Error processing section (href: ${item.href}):`, sectionError.message || sectionError);
                    sectionErrors++;
                }
                sectionTexts.push(sectionText.trim());
            }

             fullText = sectionTexts.filter(Boolean).join('\n\n');
             // Normalize excessive newlines and spaces after joining
             fullText = fullText.replace(/(\n\s*){3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();

            console.log(`Processed ${totalSections} sections with ${sectionErrors} errors.`);
            console.log(`Total extracted text length: ${fullText.length}`);

            if (sectionErrors > 0) {
                console.warn(`EPUB had ${sectionErrors} section parsing errors.`);
            }

            if (fullText.length === 0 && totalSections > 0) {
                const errorMsg = sectionErrors === totalSections ?
                    `Failed to extract any text. All ${totalSections} sections failed to load or parse.` :
                    "EPUB processing yielded no text. File might be empty, image-based, non-standard, or DRM protected.";
                console.error(errorMsg);
                reject(new Error(errorMsg));
            } else if (fullText.length === 0 && totalSections === 0) {
                reject(new Error("EPUB file has no content sections in its spine."));
            } else {
                if (sectionErrors > 0) {
                     toast({
                         title: 'Parsing Warning',
                         description: `EPUB parsed with ${sectionErrors} error(s). Some content might be missing or improperly formatted.`,
                         variant: 'destructive', // Use destructive variant for warnings too? Or create a 'warning' variant?
                         duration: 7000,
                     });
                } else {
                    console.log("EPUB parsing successful.");
                }
                resolve(fullText);
            }
        } catch (err: any) {
            console.error("Critical EPUB Processing Error:", err);
            let errorMessage = "Error parsing EPUB file.";
             if (isLikelyDrmError(err)) errorMessage += " This file might be DRM-protected.";
             else if (err.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format (not a valid zip).";
             else if (err.message?.includes('missing central directory')) errorMessage += " Invalid EPUB format (corrupted zip).";
             else if (err.message?.includes('timeout') || err.name === 'TimeoutError') errorMessage += " Processing timed out.";
             else if (err.message) errorMessage += ` Details: ${err.message}`;
             else if (err instanceof Error) errorMessage += ` Details: ${err.message}`;
             else errorMessage += " An unexpected error occurred during processing.";

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
                try { book.destroy(); console.log("EPUB book instance destroyed."); }
                catch (destroyError) { console.warn("Error destroying book instance:", destroyError); }
            } else if (book) {
                 console.warn('Book instance is present but the destroy function is not defined or accessible.');
            }
        }
    });
};

    