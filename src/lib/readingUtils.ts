
// Helper function to determine the pivot character index for ORP (Optimal Recognition Point)
// Tries to find a point slightly left of the center.
export const calculatePivot = (token: string): number => {
  if (!token) return 0;
  const len = token.length;
  // Simple pivot calculation: approx 1/3 from the start, min index 0, max index len-1
  const pivot = Math.floor(len / 3);
  return Math.max(0, Math.min(pivot, len - 1));
};

// NOTE: The other functions previously in this file were moved to
// wordUtils.ts and punctuationUtils.ts
// This file now only contains calculatePivot as requested by the user's error report context.
// However, it seems `isActualWord` and `getPunctuationType` are also needed here based on context.
// Re-adding them here to consolidate utils used by multiple components/hooks.

// Helper function to check if a token (split by whitespace) contains letters/numbers
// Allows hyphens and apostrophes within words.
export const isActualWord = (token: string): boolean => !!token && /[\p{L}\p{N}'-]+/gu.test(token);

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
