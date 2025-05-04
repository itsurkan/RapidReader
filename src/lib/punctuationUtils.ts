
// Helper function to determine punctuation type at the end of a token
export const getPunctuationType = (token: string): 'sentence' | 'clause' | 'none' => {
    if (!token) return 'none';
    // Check specifically for sentence-ending punctuation
    // Includes common multi-character endings like?!"
    if (/[.?!]["')\]]*$/.test(token)) return 'sentence';
    // Check specifically for clause-ending punctuation
    if (/[,;:]["')\]]*$/.test(token)) return 'clause';
    return 'none';
};
