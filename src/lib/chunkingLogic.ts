
import { isActualWord, getPunctuationType, STICKY_WORDS } from './readingUtils';

interface ChunkInfo {
    endIndex: number;
    actualWordsInChunk: number;
    isAdjusted: boolean;
}

interface ChunkState {
    wordsInCurrentChunk: number;
    currentIndex: number;
    punctuationFound: 'sentence' | 'clause' | 'none';
    wordsSinceLastPunctuation: number;
    isAdjusted: boolean;
    currentTargetWordCount: number;
}

// Helper to calculate the adaptive target word count
const calculateCurrentTargetWordCount = (
    targetWordCount: number,
    wordsSinceLastPunctuation: number,
    punctuationFound: 'sentence' | 'clause' | 'none',
    maxWordExtension: number
): { currentTarget: number; isAdjusted: boolean } => {
    let currentTarget = targetWordCount;
    let isAdjusted = false;
    // Adjust target *up* if 2*target words seen without significant punctuation
    if (wordsSinceLastPunctuation >= targetWordCount * 2 && punctuationFound !== 'sentence' && punctuationFound !== 'clause') {
        currentTarget = Math.min(targetWordCount + maxWordExtension, targetWordCount * 2); // Cap at target + maxExtension or double
        isAdjusted = true;
    }
    return { currentTarget, isAdjusted };
};

// Helper to backtrack if chunk exceeds maximum extension
const backtrackIfExceeded = (
    state: ChunkState,
    startIndex: number,
    targetWordCount: number,
    maxWordExtension: number,
    allTokens: string[]
): ChunkState => {
    const maxAllowedWords = targetWordCount + maxWordExtension;
    if (state.wordsInCurrentChunk <= maxAllowedWords) {
        return state; // No backtracking needed
    }

    let backtrackIndex = state.currentIndex;
    let backtrackWords = state.wordsInCurrentChunk;
    while (backtrackWords > maxAllowedWords && backtrackIndex > startIndex) {
        backtrackIndex--;
        if (isActualWord(allTokens[backtrackIndex])) {
            backtrackWords--;
        }
    }
    // console.log(`Chunk exceeded max extension (${maxAllowedWords}). Backtracking from ${state.currentIndex} to ${backtrackIndex + 1}`);
    return {
        ...state,
        currentIndex: backtrackIndex, // Point to the token *at* the end of the backtracked chunk
        wordsInCurrentChunk: backtrackWords,
    };
};

// Helper for lookahead logic
const handleLookahead = (
    state: ChunkState,
    startIndex: number,
    targetWordCount: number,
    maxWordExtension: number,
    allTokens: string[]
): { extendedIndex: number; extendedWords: number } | null => {
    const maxAllowedWords = targetWordCount + maxWordExtension;
    if (state.punctuationFound === 'sentence' || state.wordsInCurrentChunk > maxAllowedWords) {
        return null; // Don't lookahead if ending on sentence or already exceeded max
    }

    let lookaheadIndex = state.currentIndex + 1;
    let lookaheadWords = 0;
    let firstPunctuationIndex = -1;
    let wordsAtFirstPunctuation = -1;

    while (lookaheadIndex < allTokens.length) {
        const nextToken = allTokens[lookaheadIndex];
        if (isActualWord(nextToken)) {
            lookaheadWords++;
        }

        // Stop looking if we exceed the max allowed extension *words* beyond the original target
        if (state.wordsInCurrentChunk + lookaheadWords > maxAllowedWords) {
            break;
        }

        const lookaheadPunctuationType = getPunctuationType(nextToken);
        const lookaheadClauseBreakSensitivity = Math.max(1, Math.ceil(state.currentTargetWordCount / 2));
        if (lookaheadPunctuationType === 'sentence' || (lookaheadPunctuationType === 'clause' && (state.wordsSinceLastPunctuation + lookaheadWords) >= lookaheadClauseBreakSensitivity)) {
            firstPunctuationIndex = lookaheadIndex;
            wordsAtFirstPunctuation = state.wordsInCurrentChunk + lookaheadWords;
            break; // Found the first significant punctuation within allowed extension
        }

        lookaheadIndex++;
    }

    // If we found punctuation within the allowed extension range
    if (firstPunctuationIndex !== -1) {
        return {
            extendedIndex: firstPunctuationIndex + 1, // Extend chunk to point *after* punctuation
            extendedWords: wordsAtFirstPunctuation,
        };
    }

    return null; // No suitable punctuation found within range
};

// Helper to apply sticky word adjustment
const applyStickyWordAdjustment = (endIndex: number, startIndex: number, allTokens: string[]): number => {
    if (endIndex > startIndex && endIndex < allTokens.length) {
        const lastTokenIndex = endIndex - 1;
        const lastToken = allTokens[lastTokenIndex]?.toLowerCase().replace(/[.,!?;:]$/, ''); // Clean last token, add safety check
        const nextToken = allTokens[endIndex]; // Get the token immediately after the potential end

        if (lastToken && STICKY_WORDS.has(lastToken) && isActualWord(nextToken)) {
            // If the last token is a sticky word and the next token is an actual word,
            // try to reduce the chunk size by one token (backtrack)
            if (endIndex > startIndex + 1) { // Ensure we don't backtrack past the start
                // console.log(`Adjusted chunk end: Avoided splitting "${lastToken}" from next word.`);
                return endIndex - 1; // Backtrack one token
            }
            // If backtracking isn't possible (chunk would be too small/empty), we let it split.
        }
    }
    return endIndex; // No adjustment needed
};

// Helper to calculate final chunk details
const calculateFinalChunk = (
    startIndex: number,
    endIndex: number,
    isAdjusted: boolean,
    allTokens: string[]
): ChunkInfo => {
    // Ensure at least one token is always included if possible and not at end
    const finalEndIndex = (endIndex === startIndex && startIndex < allTokens.length) ? startIndex + 1 : endIndex;

    // Recalculate actual words for the *final* chunk
    let finalActualWordsCount = 0;
    for (let i = startIndex; i < finalEndIndex; i++) {
        if (isActualWord(allTokens[i])) {
            finalActualWordsCount++;
        }
    }

    return { endIndex: finalEndIndex, actualWordsInChunk: finalActualWordsCount, isAdjusted };
};

// Main Refactored Function
export const findChunkInfo = (
    startIndex: number,
    targetWordCount: number,
    allTokens: string[],
    maxWordExtension: number = 3
): ChunkInfo => {
    if (startIndex >= allTokens.length) {
        return { endIndex: startIndex, actualWordsInChunk: 0, isAdjusted: false };
    }

    let state: ChunkState = {
        wordsInCurrentChunk: 0,
        currentIndex: startIndex,
        punctuationFound: 'none',
        wordsSinceLastPunctuation: 0,
        isAdjusted: false,
        currentTargetWordCount: targetWordCount,
    };

    while (state.currentIndex < allTokens.length) {
        const token = allTokens[state.currentIndex];
        const isWord = isActualWord(token);

        if (isWord) {
            state.wordsInCurrentChunk++;
            state.wordsSinceLastPunctuation++;
        }
        state.punctuationFound = getPunctuationType(token);

        // Calculate adaptive target size
        const { currentTarget, isAdjusted: wasAdjusted } = calculateCurrentTargetWordCount(
            targetWordCount,
            state.wordsSinceLastPunctuation,
            state.punctuationFound,
            maxWordExtension
        );
        state.currentTargetWordCount = currentTarget;
        // Only update isAdjusted if it becomes true, or reset it if punctuation breaks the run
        if (wasAdjusted) {
            state.isAdjusted = true;
        } else if (state.punctuationFound === 'sentence' || state.punctuationFound === 'clause') {
            state.isAdjusted = false; // Reset adjustment if punctuation is hit
        }
        // else: keep isAdjusted true if it was already set

        // Check if we have reached the *current* target word count or more
        if (state.wordsInCurrentChunk >= state.currentTargetWordCount) {
            // Backtrack first if we've exceeded the absolute max extension
            state = backtrackIfExceeded(state, startIndex, targetWordCount, maxWordExtension, allTokens);
            // Break immediately after backtracking if we did backtrack (to avoid further extension)
             if (state.wordsInCurrentChunk <= targetWordCount + maxWordExtension && state.currentIndex < startIndex + state.wordsInCurrentChunk ) {
                // we backtracked, break the loop
                 break;
             }


            // Check if current token ends the chunk based on punctuation
             const clauseBreakSensitivity = Math.max(1, Math.ceil(state.currentTargetWordCount / 2));
             if (state.punctuationFound === 'sentence' || (state.punctuationFound === 'clause' && state.wordsSinceLastPunctuation >= clauseBreakSensitivity)) {
                 state.currentIndex++; // Increment to include the punctuation
                 break;
             }


            // Try lookahead if conditions are met
            const lookaheadResult = handleLookahead(state, startIndex, targetWordCount, maxWordExtension, allTokens);
            if (lookaheadResult) {
                state.currentIndex = lookaheadResult.extendedIndex;
                state.wordsInCurrentChunk = lookaheadResult.extendedWords;
                break; // Break after successful lookahead extension
            }
            // If no punctuation break and no lookahead extension, the loop continues
        }

        // Move to the next token if not breaking
        state.currentIndex++;

        // Reset wordsSinceLastPunctuation if needed *after* checking conditions
        if (state.punctuationFound === 'sentence' || state.punctuationFound === 'clause') {
            state.wordsSinceLastPunctuation = 0;
            // isAdjusted reset is handled earlier
        }
    }

    // Ensure endIndex doesn't exceed bounds
    let finalEndIndex = Math.min(state.currentIndex, allTokens.length);

    // Apply sticky word adjustment
    finalEndIndex = applyStickyWordAdjustment(finalEndIndex, startIndex, allTokens);

    // Calculate final details
    return calculateFinalChunk(startIndex, finalEndIndex, state.isAdjusted, allTokens);
};
