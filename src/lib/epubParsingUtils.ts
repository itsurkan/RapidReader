
// Helper function to check if an error might be related to DRM
export function isLikelyDrmError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  // Keywords often associated with DRM issues in epubjs or related contexts
  return message.includes('encrypted') || message.includes('decryption') || message.includes('content protection');
}

// Refined recursive function to extract text, simplifying spacing logic and adding paragraph breaks
export const extractTextRecursive = (node: Node | null): string => {
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
