
// Helper function to determine the pivot character index for ORP (Optimal Recognition Point)
// Tries to find a point slightly left of the center.
export const calculatePivot = (token: string): number => {
  if (!token) return 0;
  const len = token.length;
  // Simple pivot calculation: approx 1/3 from the start, min index 0, max index len-1
  const pivot = Math.floor(len / 3);
  return Math.max(0, Math.min(pivot, len - 1));
};

// NOTE: isActualWord and getPunctuationType were moved to wordUtils.ts and punctuationUtils.ts respectively
