
/**
 * Normalizes and joins the extracted text from all sections.
 * @param sectionTexts - An array of strings, each representing the text of a section.
 * @returns The normalized full text content as a single string.
 */
export function normalizeAndJoinText(sectionTexts: string[]): string {
    if (!sectionTexts || sectionTexts.length === 0) return '';

    let fullText = sectionTexts
        .map(text => text.replace(/\r\n/g, '\n')) // Normalize line endings
        .filter(Boolean) // Remove empty strings from failed sections
        .join('\n\n'); // Join sections with double newline

    // More robust normalization: trim lines, remove empty lines, collapse spaces/tabs, reduce excessive newlines
    fullText = fullText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/(\n){3,}/g, '\n\n');

    console.log(`[INFO] Total extracted text length after normalization: ${fullText.length}`);
    return fullText;
}
