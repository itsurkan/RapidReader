
// Helper function to check if a token (split by whitespace) contains letters/numbers
export const isActualWord = (token: string): boolean => !!token && /[\p{L}\p{N}'-]+/gu.test(token);

// Helper function to determine punctuation type at the end of a token
export const getPunctuationType = (token: string): 'sentence' | 'clause' | 'none' => {
    if (!token) return 'none';
    // Check specifically for sentence-ending punctuation
    if (/[.?!]$/.test(token)) return 'sentence';
    // Check specifically for clause-ending punctuation
    if (/[,;:]$/.test(token)) return 'clause';
    return 'none';
};


// --- START Word Category Lists ---
const PREPOSITIONS = new Set(['about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'but', 'by', 'concerning', 'despite', 'down', 'during', 'except', 'for', 'from', 'in', 'inside', 'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'regarding', 'since', 'through', 'throughout', 'to', 'toward', 'under', 'underneath', 'until', 'unto', 'up', 'upon', 'with', 'within', 'without']);
const ARTICLES = new Set(['a', 'an', 'the']);
const PRONOUNS = new Set([ // Possessive and demonstrative often act like articles/determiners
    'my', 'your', 'his', 'her', 'its', 'our', 'their', // Possessive adjectives
    'this', 'that', 'these', 'those' // Demonstratives
    // Add personal/object pronouns? Maybe not needed for this rule.
]);
// Combine into a single set for easy checking
const STICKY_WORDS = new Set([...PREPOSITIONS, ...ARTICLES, ...PRONOUNS]);
// --- END Word Category Lists ---

// Helper function to find the indices and word count for the next chunk based on logical pieces
export const findChunkInfo = (
    startIndex: number,
    targetWordCount: number, // Approximate target words per displayed chunk
    allTokens: string[],
    maxWordExtension: number = 3 // Maximum words to exceed targetWordCount
): { endIndex: number; actualWordsInChunk: number, isAdjusted: boolean } => {
    if (startIndex >= allTokens.length) {
        return { endIndex: startIndex, actualWordsInChunk: 0, isAdjusted: false };
    }

    let wordsInCurrentChunk = 0;
    let currentIndex = startIndex;
    let punctuationFound: 'sentence' | 'clause' | 'none' = 'none';
    let wordsSinceLastPunctuation = 0; // Track words since last significant punctuation
    let isAdjusted = false; // Flag to indicate if chunk size was adaptively changed

    while (currentIndex < allTokens.length) {
        const token = allTokens[currentIndex];
        const isWord = isActualWord(token);

        if (isWord) {
            wordsInCurrentChunk++;
            wordsSinceLastPunctuation++;
        }

        punctuationFound = getPunctuationType(token);

        // Adaptive Chunk Size Logic: If we've seen many words without punctuation, increase target size
        let currentTargetWordCount = targetWordCount;
        // Adjust target *up* if 2*target words seen without punctuation
        if (wordsSinceLastPunctuation >= targetWordCount * 2 && punctuationFound !== 'sentence' && punctuationFound !== 'clause') {
            currentTargetWordCount = Math.min(targetWordCount + maxWordExtension, targetWordCount * 2); // Cap at target + maxExtension or double, whichever is smaller
            isAdjusted = true;
            // console.log(`Adjusting target chunk size UP to ${currentTargetWordCount} due to long run of words.`);
        } else {
             // Only reset adjustment flag if we *hit* punctuation that breaks the long run
             if (punctuationFound === 'sentence' || punctuationFound === 'clause') {
                isAdjusted = false;
             }
             // Otherwise, keep the adjustment if it was already true
        }


        // Check if we have reached the *current* target word count or more
        if (wordsInCurrentChunk >= currentTargetWordCount) {
            // Check if we've exceeded the absolute maximum allowed words (based on original target + extension)
             if (wordsInCurrentChunk > targetWordCount + maxWordExtension) {
                 // If we've gone too far, backtrack to keep chunk size reasonable
                 let backtrackIndex = currentIndex;
                 let backtrackWords = wordsInCurrentChunk;
                 while(backtrackWords > targetWordCount + maxWordExtension && backtrackIndex > startIndex) {
                     backtrackIndex--;
                     if (isActualWord(allTokens[backtrackIndex])) {
                         backtrackWords--;
                     }
                 }
                //   console.log(`Chunk exceeded max extension (${targetWordCount + maxWordExtension}). Backtracking from ${currentIndex} to ${backtrackIndex + 1}`);
                 currentIndex = backtrackIndex; // Point to the token *at* the end of the backtracked chunk
                 wordsInCurrentChunk = backtrackWords; // Update word count for the backtracked chunk
                 break; // Force break after backtracking
             }


            // If we are at or above target, and found sentence/clause end, break here.
             // Make clause break less sensitive if target is small
             const clauseBreakSensitivity = Math.max(1, Math.ceil(currentTargetWordCount / 2));
            if (punctuationFound === 'sentence' || (punctuationFound === 'clause' && wordsSinceLastPunctuation >= clauseBreakSensitivity)) {
                 currentIndex++; // Increment to include the punctuation in the *end* index calculation
                 break;
            }

            // Lookahead Logic (only if not ending on current punctuation and not exceeding max extension yet)
             if (punctuationFound !== 'sentence' && wordsInCurrentChunk <= targetWordCount + maxWordExtension) {
                let lookaheadIndex = currentIndex + 1;
                let lookaheadWords = 0;
                let firstPunctuationIndex = -1;
                let wordsAtFirstPunctuation = -1;

                while (lookaheadIndex < allTokens.length) {
                    const nextToken = allTokens[lookaheadIndex];
                    let foundPunctuation = false;
                    if (isActualWord(nextToken)) {
                        lookaheadWords++;
                    }

                    // Stop looking if we exceed the max allowed extension *words* beyond the original target
                     if (wordsInCurrentChunk + lookaheadWords > targetWordCount + maxWordExtension) {
                         break;
                     }

                    const lookaheadPunctuationType = getPunctuationType(nextToken);
                     const lookaheadClauseBreakSensitivity = Math.max(1, Math.ceil(currentTargetWordCount / 2));
                     if (lookaheadPunctuationType === 'sentence' || (lookaheadPunctuationType === 'clause' && (wordsSinceLastPunctuation + lookaheadWords) >= lookaheadClauseBreakSensitivity) ) {
                         firstPunctuationIndex = lookaheadIndex;
                         wordsAtFirstPunctuation = wordsInCurrentChunk + lookaheadWords;
                         foundPunctuation = true;
                         break; // Found the first significant punctuation within allowed extension
                    }

                    lookaheadIndex++;
                }

                // If we found punctuation within the allowed extension range
                if (firstPunctuationIndex !== -1) {
                    currentIndex = firstPunctuationIndex + 1; // Extend chunk to point *after* punctuation
                    wordsInCurrentChunk = wordsAtFirstPunctuation; // Update word count
                    break; // Break after extending
                }
                // else: No suitable punctuation found within range, loop will continue or break naturally if end of text
            }
            // If lookahead wasn't needed or didn't extend, continue to next token in main loop
        }

        // Move to the next token index if we haven't met the target count yet
        currentIndex++;


        // Reset punctuation tracking if needed *after* checking lookahead
         if (punctuationFound === 'sentence' || punctuationFound === 'clause') {
             wordsSinceLastPunctuation = 0;
             // Adjustment flag reset is handled at the start of the loop now
        }

    }

     // Ensure endIndex doesn't exceed bounds
     let endIndex = Math.min(currentIndex, allTokens.length);

    // --- START Sticky Word Check ---
    if (endIndex > startIndex && endIndex < allTokens.length) {
        const lastTokenIndex = endIndex - 1;
        const lastToken = allTokens[lastTokenIndex]?.toLowerCase().replace(/[.,!?;:]$/, ''); // Clean last token, add safety check
        const nextToken = allTokens[endIndex]; // Get the token immediately after the potential end

        if (lastToken && STICKY_WORDS.has(lastToken) && isActualWord(nextToken)) {
            // If the last token is a sticky word and the next token is an actual word,
            // try to reduce the chunk size by one token (backtrack)
            if (endIndex > startIndex + 1) { // Ensure we don't backtrack past the start
                endIndex--; // Backtrack one token
                // console.log(`Adjusted chunk end: Avoided splitting "${lastToken}" from next word.`);
            }
            // If backtracking isn't possible (chunk would be too small/empty), we let it split.
        }
    }
    // --- END Sticky Word Check ---


    // Recalculate actual words within the final chunk [startIndex, endIndex)
    let actualWordsCount = 0;
    for (let i = startIndex; i < endIndex; i++) {
        if (isActualWord(allTokens[i])) {
            actualWordsCount++;
        }
    }

     // Ensure at least one token is always included if possible and not at end
     const finalEndIndex = (endIndex === startIndex && startIndex < allTokens.length) ? startIndex + 1 : endIndex;

    // Recalculate actual words for the *final* chunk if finalEndIndex changed
    let finalActualWordsCount = actualWordsCount;
     if (finalEndIndex !== endIndex && finalEndIndex === startIndex + 1) {
         finalActualWordsCount = 0;
         if (startIndex < allTokens.length && isActualWord(allTokens[startIndex])) {
             finalActualWordsCount = 1;
         }
     }


    return { endIndex: finalEndIndex, actualWordsInChunk: finalActualWordsCount, isAdjusted: isAdjusted }; // Return adjustment flag
};


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
         // Use targetWordCount for finding chunks consistently when going back
         const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);
         if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop
         simulatedStartIndex = endIndex; // Move to the start of the *next* chunk
    }

    // The start of the previous chunk is the last valid start index we recorded.
    return lastValidStartIndex;
};

// Helper function to find the start index of the chunk containing a specific word index
export const findChunkStartForWordIndex = (
    targetWordIndex: number,
    targetWordCount: number,
    allTokens: string[]
): number => {
    if (targetWordIndex <= 0) return 0;

    let simulatedStartIndex = 0;
    let wordsCounted = 0;
    let chunkStartIndex = 0; // The start index of the chunk we're currently calculating

    while (simulatedStartIndex < allTokens.length) {
        chunkStartIndex = simulatedStartIndex; // Store the start index of the current chunk
        // Use findChunkInfo, ignoring the isAdjusted flag for seeking
        const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);

        // Count actual words up to the end of this chunk
        let wordsInThisChunkAndBefore = 0;
        for(let i=0; i < endIndex; i++){
            if(isActualWord(allTokens[i])) {
                wordsInThisChunkAndBefore++;
            }
        }

        // If the target word index falls within the words processed *up to the end of this chunk*,
        // then the start of *this* chunk is our answer.
        if (wordsInThisChunkAndBefore >= targetWordIndex) {
            return chunkStartIndex;
        }

        if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop
        simulatedStartIndex = endIndex; // Move to the start of the next chunk
    }

    // If the loop finishes (e.g., targetWordIndex is beyond the last word), return the start of the last calculated chunk.
    return chunkStartIndex;
};
