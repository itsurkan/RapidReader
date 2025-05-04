
import { isActualWord } from '@/lib/readingUtils'; // Correct path using alias
import { getPunctuationType } from '@/lib/punctuationUtils'; // Correct path using alias

interface ChunkInfo {
    endIndex: number; // Index *after* the last token in the chunk
    actualWordsInChunk: number;
    isAdjusted: boolean; // Indicates if overflow/secondary splitting was used
}

/**
 * Finds the index of the next sentence-ending punctuation mark.
 * @param startIndex - The index in allTokens to start searching from.
 * @param allTokens - The array of all tokens.
 * @returns Object containing the index of the sentence-ending token and the word count, or { index: -1, wordCount: -1 } if not found.
 */
const findNextSentenceEnd = (
    startIndex: number,
    allTokens: string[]
): { index: number; wordCount: number } => {
    let wordCount = 0;
    for (let i = startIndex; i < allTokens.length; i++) {
        const token = allTokens[i];
        if (isActualWord(token)) {
            wordCount++;
        }
        if (getPunctuationType(token) === 'sentence') {
            return { index: i, wordCount };
        }
    }
    return { index: -1, wordCount: -1 };
};

/**
 * Finds a suitable split point when a sentence is too long or not found.
 * Aims for targetWordCount, allows up to maxWordOverflow, prefers splitting after punctuation.
 * @param startIndex - The index in allTokens to start searching from.
 * @param targetWordCount - The ideal number of words per chunk.
 * @param maxWordOverflow - The maximum number of words allowed beyond the target.
 * @param allTokens - The array of all tokens.
 * @returns ChunkInfo object for the determined chunk.
 */
const findSecondarySplitPoint = (
    startIndex: number,
    targetWordCount: number,
    maxWordOverflow: number,
    allTokens: string[]
): ChunkInfo => {
    let actualWordsCounted = 0;
    let currentIndex = startIndex;
    let lastPunctuationBreakPoint = -1; // Index *after* the punctuation token
    const maxWordsAllowed = targetWordCount + maxWordOverflow;

    while (currentIndex < allTokens.length) {
        const token = allTokens[currentIndex];
        const isWord = isActualWord(token);

        if (isWord) {
            actualWordsCounted++;
        }

        // Stop if we exceed the maximum allowed words for this secondary split
        if (actualWordsCounted > maxWordsAllowed) {
            break; // Stop *before* including the token that exceeded the limit
        }

        // Record the potential break point *after* sentence or clause punctuation
        const puncType = getPunctuationType(token);
        if (puncType === 'sentence' || puncType === 'clause') {
            lastPunctuationBreakPoint = currentIndex + 1;
        }

        currentIndex++; // Move to the next token for the next iteration

         // Special case: If we just hit the *exact* max allowed words, stop scanning
         // (unless the current token was punctuation, allowing the breakpoint update above)
         if (actualWordsCounted === maxWordsAllowed && puncType === 'none') {
             break;
         }

    }

    // Determine the final end index
    let finalEndIndex = currentIndex; // Default to where the scan stopped

    // Prefer the last punctuation break point if it's valid and within the scanned range
    if (lastPunctuationBreakPoint > startIndex && lastPunctuationBreakPoint <= currentIndex) {
        finalEndIndex = lastPunctuationBreakPoint;
        // Recalculate actual words for the punctuation-based split
        actualWordsCounted = 0;
        for (let i = startIndex; i < finalEndIndex; i++) {
            if (isActualWord(allTokens[i])) {
                actualWordsCounted++;
            }
        }
        // console.log(`Secondary split: Using punctuation break at ${finalEndIndex}, words: ${actualWordsCounted}`);
    } else {
       // If no punctuation break used, the word count is what we tracked in the loop up to `currentIndex`.
       // If the loop broke because `actualWordsCounted > maxWordsAllowed`, we need the count *at* `currentIndex`.
       if(finalEndIndex > startIndex) {
            let countAtEnd = 0;
             for (let i = startIndex; i < finalEndIndex; i++) {
                 if (isActualWord(allTokens[i])) {
                     countAtEnd++;
                 }
             }
             actualWordsCounted = countAtEnd;
       } else {
          actualWordsCounted = 0;
       }
        // console.log(`Secondary split: Using word limit break at ${finalEndIndex}, words: ${actualWordsCounted}`);
    }


    // Ensure at least one token is included if possible and not at end
    if (finalEndIndex === startIndex && startIndex < allTokens.length) {
         finalEndIndex = startIndex + 1;
         if (isActualWord(allTokens[startIndex])) {
             actualWordsCounted = 1;
         } else {
            actualWordsCounted = 0;
         }
    }


    return {
        endIndex: finalEndIndex,
        actualWordsInChunk: actualWordsCounted,
        isAdjusted: true, // Secondary split always means adjustment from sentence rule
    };
};

/**
 * Main function to determine the next chunk of tokens for reading.
 * Prioritizes splitting after sentences, but falls back to a secondary
 * mechanism if sentences are too long or not found, respecting a maximum overflow.
 *
 * @param startIndex - The starting index in the `allTokens` array.
 * @param targetWordCount - The ideal number of actual words desired in the chunk.
 * @param allTokens - The array of all tokens (words and punctuation).
 * @param maxWordOverflow - The maximum number of *additional* actual words allowed beyond `targetWordCount`. Defaults to 3.
 * @returns {ChunkInfo} An object containing the `endIndex` (index *after* the last token of the chunk),
 *          `actualWordsInChunk`, and `isAdjusted` flag.
 */
export const findChunkInfo = (
    startIndex: number,
    targetWordCount: number,
    allTokens: string[],
    maxWordOverflow: number = 3 // Default overflow limit
): ChunkInfo => {
    if (startIndex >= allTokens.length) {
        return { endIndex: startIndex, actualWordsInChunk: 0, isAdjusted: false };
    }

    const { index: sentenceEndIndex, wordCount: sentenceChunkWordCount } = findNextSentenceEnd(startIndex, allTokens);

    // Case 1: Sentence end found
    if (sentenceEndIndex !== -1) {
        const maxWordsAllowed = targetWordCount + maxWordOverflow;

        // Case 1a: The sentence fits within the allowed limit (target + overflow)
        if (sentenceChunkWordCount <= maxWordsAllowed && sentenceChunkWordCount > 0) { // Ensure sentence has words
             // Check if the word count is exactly the target or less, or if it's an overflow adjustment
             const adjusted = sentenceChunkWordCount > targetWordCount;
             // console.log(`Chunking: Found sentence end at ${sentenceEndIndex}. Fits limit (${sentenceChunkWordCount} <= ${maxWordsAllowed}). Adjusted: ${adjusted}`);
            return {
                endIndex: sentenceEndIndex + 1, // End *after* the punctuation
                actualWordsInChunk: sentenceChunkWordCount,
                isAdjusted: adjusted,
            };
        }
        // Case 1b: The sentence is too long or has 0 words, use secondary splitting
        else {
            // console.log(`Chunking: Found sentence end at ${sentenceEndIndex}, but too long (${sentenceChunkWordCount} > ${maxWordsAllowed}) or 0 words. Using secondary split.`);
            return findSecondarySplitPoint(startIndex, targetWordCount, maxWordOverflow, allTokens);
        }
    }
    // Case 2: No sentence end found until the end of the text
    else {
        // console.log(`Chunking: No sentence end found from ${startIndex}. Using secondary split.`);
        return findSecondarySplitPoint(startIndex, targetWordCount, maxWordOverflow, allTokens);
    }
};
