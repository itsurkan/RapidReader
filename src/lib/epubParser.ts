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
        const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'UL', 'OL', 'BODY'].includes(tagName);
        const isLineBreak = tagName === 'BR';

        // Add double newline *before* processing children of a block element, if needed
        if (isBlock && currentText.length > 0 && !currentText.endsWith('\n')) {
            currentText += '\n\n';
        }

        let prevChildWasText = false; // Track if the previous child added text
        for (let i = 0; i < node.childNodes.length; i++) {
            const childNode = node.childNodes[i];
            const childText = extractTextRecursive(childNode); // Recursive call

            if (childText) {
                // Add space *before* child text if the current text exists, doesn't end with space/newline,
                // AND the child text doesn't start with space/newline/punctuation.
                if (currentText.length > 0 && !/[\s\n]$/.test(currentText) && !/^[\s\n.,!?;:]/.test(childText)) {
                    currentText += ' ';
                }
                currentText += childText;
                prevChildWasText = childNode.nodeType === Node.TEXT_NODE || childNode.nodeType === Node.ELEMENT_NODE;
            }
        }

        // Add double newline *after* processing children of a block element or BR, if needed
        if ((isBlock || isLineBreak) && currentText.length > 0 && !currentText.endsWith('\n')) {
             currentText += '\n\n';
        }
    }
    return currentText;
};

export const parseEpub = async (
    file: File,
    toast: (options: any) => { id: string; dismiss: () => void; update: (props: any) => void; }, // Include return type for toast
    dismiss: (id: string) => void // Include dismiss function type
): Promise<string> => {
    const Epub = (await import('epubjs')).default;
    let book: Book | null = null;
    let toastCtrl: ReturnType<typeof toast> | null = null; // Store the toast controller

    toastCtrl = toast({
        title: 'Loading EPUB...',
        description: `Processing ${file.name}`
    });
    const toastId = toastCtrl?.id;

    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            book = Epub(arrayBuffer);

            book.on('book:error', (err: any) => {                
                console.error('EPUB Book Error Event:', err);
                reject(err);
            });
            book.on('error', (err: any) => {
                console.error("epubjs error:", err);
            })

            await book.ready;
            console.log("book.ready resolved. Metadata:", book.metadata);
            console.log("Processing spine items...");

            let fullText = '';
            let sectionErrors = 0;
            const totalSections = book.spine.items.length;
            if (totalSections === 0) console.warn("EPUB spine contains no items.", book.spine);

            const sectionTexts: string[] = [];
            for (const item of book.spine.toc) {
                let sectionText = '';
                try {
                    console.log(`Loading section (href: ${item.href}, idref: ${item.idref})...`);
                    const section: Section | undefined = await book.spine.load(item); // Use spine.load
                    if (!section) {
                        console.warn(`Section not loaded or undefined (href: ${item.href})`);
                        sectionErrors++;
                    }

                    const body = await section.render(); // Use render() to get HTML content
                    if (!body) {
                        console.warn(`Section rendered no body content (href: ${item.href})`);
                        sectionErrors++;
                    }

                    // Parse the HTML body string
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(body, 'text/html');

                    if (doc.body) {
                        sectionText = extractTextRecursive(doc.body);
                        if (!sectionText) {
                            console.warn(`Section parsing yielded no text (href: ${item.href}).`);
                        }
                    } else {
                        console.warn(`Skipping section due to missing body element after parsing (href: ${item.href}).`);
                        sectionErrors++;
                    }
                } catch (sectionError: any) {
                    console.error(`Error processing section (href: ${item.href}):`, sectionError.message || sectionError);
                    sectionErrors++;
                }
                sectionTexts.push(sectionText.trim());
            }

            fullText = sectionTexts.filter(Boolean).join('\n\n');
            fullText = fullText.replace(/[ \t]{2,}/g, ' ').replace(/(\r\n|\r|\n)[ \t]*(\r\n|\r|\n)/g, '\n\n').replace(/(\n\n){2,}/g, '\n\n').trim();

            console.log(`Processed ${totalSections} sections with ${sectionErrors} errors.`);
            console.log(`Total extracted text length: ${fullText.length}`);

            if(sectionErrors > 0) console.warn(`EPUB had ${sectionErrors} section parsing errors.`);
            if (fullText.length === 0 && totalSections > 0) {
                const errorMsg = sectionErrors === totalSections ?
                    `Failed to extract any text. All ${totalSections} sections failed.` :
                    "EPUB parsing yielded no text. File might be empty, image-based, or DRM protected.";
                console.error(errorMsg);
                reject(new Error(errorMsg));
            } else {
                if (sectionErrors > 0) {
                    console.warn(`EPUB parsed with ${sectionErrors} errors. Content might be incomplete.`);
                    toast({
                        title: 'Parsing Warning',
                        description: `EPUB parsed with ${sectionErrors} error(s). Some content might be missing.`,
                        variant: 'destructive',
                        duration: 5000,
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
            else if (err.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format.";
            else if (err.message?.includes('timed out')) errorMessage += ` ${err.message}`;
            else if (err.message) errorMessage += ` Details: ${err.message}`;
            else if (err instanceof Error) errorMessage += err.message
            else errorMessage += " Unexpected error.";
            
            reject(new Error(errorMessage));
        } finally {
            if (toastId && toastCtrl?.id === toastId) {
                 dismiss(toastId);
            }
            if (book && typeof book.destroy === 'function') {
                try { book.destroy(); } catch (destroyError) { console.warn("Error destroying book instance:", destroyError); }
            } else if(book){
                console.warn('Book instance is present but the destroy function is not defined.');
             }
        }
    });
};
