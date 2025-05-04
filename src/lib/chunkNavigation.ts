
import { findChunkInfo } from './chunkingLogic'; // Assuming findChunkInfo is in chunkingLogic.ts
import { isActualWord } from './readingUtils';

// Helper to find the start index of the *previous* chunk
export const findPreviousChunkStart = (
    currentStartIndex: number,
    targetWordCount: number,
    allTokens: string[]
): number => {
    if (currentStartIndex <= 0) return 0;

    // We need to find the chunk that *ends* at or before `currentStartIndex`.
    // Simulate chunk finding from the beginning.
    let simulatedStartIndex = 0;
    let lastValidStartIndex = 0;
    while (simulatedStartIndex < currentStartIndex) {
         lastValidStartIndex = simulatedStartIndex; // Store the start of the potential previous chunk
         // Use targetWordCount (not adaptive) for consistency when going back
         const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);
         if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop
         simulatedStartIndex = endIndex; // Move to the start of the *next* chunk
    }

    // The start of the previous chunk is the last valid start index we recorded.
    return lastValidStartIndex;
};

// Helper function to find the start index of the chunk containing a specific word index
export const findChunkStartForWordIndex = (
    targetWordIndex: number, // Target word count (1-based index)
    targetWordCount: number,
    allTokens: string[]
): number => {
    if (targetWordIndex <= 0) return 0;

    let simulatedStartIndex = 0;
    let wordsCounted = 0;
    let chunkStartIndex = 0; // The start index of the chunk we're currently calculating

    while (simulatedStartIndex < allTokens.length) {
        chunkStartIndex = simulatedStartIndex; // Store the start index of the current chunk
        // Use findChunkInfo (non-adaptive target) to determine chunk boundaries
        const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);

        // Count actual words from the beginning up to the end of this chunk
        let wordsInThisChunkAndBefore = 0;
        for (let i = 0; i < endIndex && i < allTokens.length; i++) {
            if (isActualWord(allTokens[i])) {
                wordsInThisChunkAndBefore++;
            }
        }

        // If the target word index falls within the words processed *up to the end of this chunk*,
        // then the start of *this* chunk is our answer.
        if (wordsInThisChunkAndBefore >= targetWordIndex) {
            return chunkStartIndex;
        }

        if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop if chunking doesn't advance
        simulatedStartIndex = endIndex; // Move to the start of the next chunk
    }

    // If the loop finishes (e.g., targetWordIndex is beyond the last word),
    // return the start of the last calculated chunk.
    return chunkStartIndex;
};
