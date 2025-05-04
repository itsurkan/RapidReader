
// Helper function to determine the pivot character index for ORP (Optimal Recognition Point)
// Tries to find a point slightly left of the center.
export const calculatePivot = (token: string): number => {
  if (!token) return 0;
  const len = token.length;
  // Simple pivot calculation: approx 1/3 from the start, min index 0, max index len-1
  const pivot = Math.floor(len / 3);
  return Math.max(0, Math.min(pivot, len - 1));
};

/**
 * Checks if a token is an actual word (contains letters or numbers).
 * Handles hyphens and apostrophes within words.
 * @param token The token to check.
 * @returns True if the token is considered an actual word, false otherwise.
 */
export const isActualWord = (token: string): boolean => {
    if (!token) return false;
    // Regular expression to match tokens containing at least one letter (Unicode) or number.
    // Allows hyphens and apostrophes commonly found within words.
    // Updated to use Unicode property escapes for better letter matching.
    return /[\p{L}\p{N}]+/u.test(token);
    // Old regex: return /[a-zA-Z0-9\u00C0-\u00FF]+/.test(token); // Basic Latin + some common accented chars
};
