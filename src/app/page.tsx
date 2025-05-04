'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Book } from 'epubjs'; // Import epubjs types only
import { ReaderControls } from '@/components/reader-controls';
import { ReadingDisplay } from '@/components/reading-display';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Helper function to check if an error might be related to DRM
function isLikelyDrmError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  // Keywords often associated with DRM issues in epubjs or related contexts
  return message.includes('encrypted') || message.includes('decryption') || message.includes('content protection');
}

// Helper to check if a token (split by whitespace) contains letters/numbers
const isActualWord = (token: string): boolean => !!token && /[\p{L}\p{N}'-]+/gu.test(token);

// Helper function to determine punctuation type at the end of a token
const getPunctuationType = (token: string): 'sentence' | 'clause' | 'none' => {
    if (!token) return 'none';
    // Updated to check specifically for sentence-ending punctuation
    if (/[.?!]$/.test(token)) return 'sentence';
    // Updated to check specifically for clause-ending punctuation
    if (/[,;:]$/.test(token)) return 'clause';
    return 'none';
};

// Helper to find the indices and word count for the next chunk based on logical pieces
const findChunkInfo = (
    startIndex: number,
    targetWordCount: number, // Approximate target words per displayed chunk
    allTokens: string[],
    maxWordExtension: number = 3 // Maximum words to exceed targetWordCount
): { endIndex: number; actualWordsInChunk: number } => {
    if (startIndex >= allTokens.length) {
        return { endIndex: startIndex, actualWordsInChunk: 0 };
    }

    let wordsInCurrentChunk = 0;
    let currentIndex = startIndex;
    let punctuationFound: 'sentence' | 'clause' | 'none' = 'none';
    let wordsSinceLastPunctuation = 0; // Track words since last significant punctuation

    while (currentIndex < allTokens.length) {
        const token = allTokens[currentIndex];
        const isWord = isActualWord(token);

        if (isWord) {
            wordsInCurrentChunk++;
            wordsSinceLastPunctuation++;
        }

        currentIndex++; // Move to the next token index

        punctuationFound = getPunctuationType(token);

        // End chunk if a sentence-ending punctuation is found
        if (punctuationFound === 'sentence') {
            break;
        }

        // End chunk if a clause-ending punctuation is found AND we have a reasonable number of words *since the last punctuation*
        // This helps create more logical breaks around commas/semicolons.
        if (punctuationFound === 'clause' && wordsSinceLastPunctuation >= Math.max(1, Math.ceil(targetWordCount / 1.5))) {
             wordsSinceLastPunctuation = 0; // Reset counter after a clause break
            break;
        }
        // Reset counter if clause punctuation found but not enough words followed
        if (punctuationFound === 'clause') {
             wordsSinceLastPunctuation = 0;
        }


        // If we reach the target word count *and* the current token isn't sentence punctuation, check lookahead.
        if (wordsInCurrentChunk >= targetWordCount && punctuationFound !== 'sentence') {
            // Dynamic chunk size adjustment: Look ahead for punctuation
             let lookaheadIndex = currentIndex; // Start looking from the *next* token
             let lookaheadWords = 0;
             let foundPunctuationAhead = false;
             let firstPunctuationIndex = -1;

             // Look ahead up to `maxWordExtension` additional *words* (or end of text)
             while(lookaheadIndex < allTokens.length) {
                 const nextToken = allTokens[lookaheadIndex];
                 if (isActualWord(nextToken)) {
                     lookaheadWords++;
                 }
                  // Stop looking if we exceed the max allowed extension
                 if (lookaheadWords > maxWordExtension && firstPunctuationIndex === -1) {
                      break;
                 }

                 const lookaheadPunctuationType = getPunctuationType(nextToken);
                 if (lookaheadPunctuationType === 'sentence' || lookaheadPunctuationType === 'clause') {
                     foundPunctuationAhead = true;
                     firstPunctuationIndex = lookaheadIndex;
                     break; // Found the first significant punctuation
                 }
                 lookaheadIndex++;
             }

            // If we found punctuation within the allowed extension range
            if (foundPunctuationAhead && firstPunctuationIndex !== -1) {
                // Calculate words if we extend to the found punctuation
                let wordsIfExtended = 0;
                for (let i = startIndex; i <= firstPunctuationIndex; i++) {
                    if (isActualWord(allTokens[i])) {
                        wordsIfExtended++;
                    }
                }

                // Only extend if it doesn't exceed the target + max extension limit *too much*
                // (Allow slight overrun to include the punctuation itself)
                if (wordsIfExtended <= targetWordCount + maxWordExtension) {
                    currentIndex = firstPunctuationIndex + 1; // Extend chunk to include punctuation
                    // Recalculate words in the extended chunk (important!)
                    wordsInCurrentChunk = wordsIfExtended;
                    break; // Break after extending
                } else {
                    // Exceeded limit even with lookahead, break where we were (before lookahead)
                    currentIndex--; // Go back one step as the current loop incremented it already
                    // Correct wordsInCurrentChunk if the token we backed off from was a word
                    if (isActualWord(allTokens[currentIndex])) {
                        wordsInCurrentChunk--;
                    }
                    break;
                }
            } else {
                // No punctuation found within allowed range, or lookahead wasn't triggered.
                // Break at the current point if it's not punctuation, or if it's clause punctuation without enough following words (handled earlier).
                 if (punctuationFound === 'none') {
                    break;
                 }
                 // If the current token *is* clause punctuation but didn't trigger the break earlier,
                 // it means we didn't have enough words *since the last significant punctuation*.
                 // In this case, we *should* break here.
                 if (punctuationFound === 'clause') {
                    break;
                 }
            }
        }
    }

     // Ensure endIndex doesn't exceed bounds
     const endIndex = Math.min(currentIndex, allTokens.length);

    // Recalculate actual words within the final chunk [startIndex, endIndex)
    let actualWordsCount = 0;
    for (let i = startIndex; i < endIndex; i++) {
        if (isActualWord(allTokens[i])) {
            actualWordsCount++;
        }
    }

     // Ensure at least one token is always included if possible
     const finalEndIndex = (endIndex === startIndex && startIndex < allTokens.length) ? startIndex + 1 : endIndex;

    // Recalculate actual words for the *final* chunk if finalEndIndex changed
    let finalActualWordsCount = actualWordsCount;
     if (finalEndIndex !== endIndex) {
         finalActualWordsCount = 0;
         for (let i = startIndex; i < finalEndIndex; i++) {
             if (isActualWord(allTokens[i])) {
                 finalActualWordsCount++;
             }
         }
     }


    return { endIndex: finalEndIndex, actualWordsInChunk: finalActualWordsCount };
};


// Helper to find the start index of the *previous* chunk
const findPreviousChunkStart = (
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
         // Use targetWordCount for finding chunks consistently
         const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);
         if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop
         simulatedStartIndex = endIndex; // Move to the start of the *next* chunk
    }

    // The start of the previous chunk is the last valid start index we recorded.
    return lastValidStartIndex;
};


export default function Home() {
  const [text, setText] = useState<string>('');
  const [words, setWords] = useState<string[]>([]); // Changed from tokens back to words for clarity, but logic uses tokens
  const [actualWordCount, setActualWordCount] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0); // Index in the words array
  const [wpm, setWpm] = useState<number>(300);
  const [chunkWordTarget, setChunkWordTarget] = useState<number>(2); // Target *approximate words* per chunk display
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // Ref for managing setTimeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const toastRef = useRef<ReturnType<typeof toast> | null>(null); // Ref to store toast ID

  // Function to calculate base interval delay per *word* based on WPM
  const calculateWordInterval = useCallback(() => {
    const effectiveWpm = Math.max(1, wpm);
    return (60 / effectiveWpm) * 1000;
  }, [wpm]);


   // Simplified recursive function to extract text, adding paragraph breaks
   const extractTextRecursive = useCallback((node: Node): string => {
       let currentText = '';
       if (!node) return '';

       if (node.nodeType === Node.TEXT_NODE) {
           const trimmed = node.textContent?.trim();
           if (trimmed) {
                // Add space if needed before appending
                if (currentText.length > 0 && !/\s$/.test(currentText)) {
                    currentText += ' ';
                }
                currentText += trimmed;
           }
       } else if (node.nodeType === Node.ELEMENT_NODE) {
           const element = node as HTMLElement;
           const tagName = element.tagName.toUpperCase();
           const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'UL', 'OL', 'BODY'].includes(tagName);
            const isLineBreak = tagName === 'BR';

           // Add double newline *before* processing children of a block element, if text exists and not already ended with newline(s)
           if (isBlock && currentText.length > 0 && !currentText.endsWith('\n')) {
                currentText += '\n\n';
           }

           for (let i = 0; i < node.childNodes.length; i++) {
                const childText = extractTextRecursive(node.childNodes[i]);
                if (childText) {
                    // Add space if needed before appending child text, avoid double spaces or space before punctuation
                    if (currentText.length > 0 && !/\s$/.test(currentText) && !/^\s/.test(childText) && !/^[.,!?;:]/.test(childText)) {
                        currentText += ' ';
                    }
                    currentText += childText;
                }
           }

            // Add double newline *after* processing children of a block element or BR, if text exists and not already ended with newline(s)
            if ((isBlock || isLineBreak) && currentText.length > 0 && !currentText.endsWith('\n')) {
                 currentText += '\n\n';
           }
       }
       return currentText;
   }, []);


  const parseEpub = useCallback(async (file: File): Promise<string> => {
    const Epub = (await import('epubjs')).default;
    let book: Book | null = null;
    let toastId: string | undefined; // Variable to hold the loading toast ID

    // Show loading toast immediately
    const loadingToast = toast({ title: 'Loading EPUB...', description: `Processing ${file.name}` });
    toastId = loadingToast.id; // Store the ID

    return new Promise(async (resolve, reject) => { // Make the promise async
        try {
          console.log("FileReader successful, attempting to load EPUB...");
          const arrayBuffer = await file.arrayBuffer(); // Use await with arrayBuffer()
          console.log(`EPUB ArrayBuffer size: ${arrayBuffer.byteLength}`);

          book = Epub(arrayBuffer, { encoding: 'binary' });

          book.on('book:error', (err: any) => {
            console.error('EPUB Book Error Event:', err);
            reject(new Error(`EPUB loading error: ${err.message || 'Unknown error during book initialization.'} ${isLikelyDrmError(err) ? ' (Possible DRM)' : ''}`));
          });

          console.log("EPUB instance created, awaiting book.ready...");
          const readyTimeout = 45000;
          const readyPromise = book.ready;
          const timeoutPromise = new Promise((_, rejectTimeout) =>
            setTimeout(() => rejectTimeout(new Error(`EPUB book.ready timed out after ${readyTimeout / 1000} seconds.`)), readyTimeout)
          );

          await Promise.race([readyPromise, timeoutPromise]);

          console.log("book.ready resolved. Metadata:", book.metadata);
          console.log("Processing spine items...");

          let fullText = '';
          let sectionErrors = 0;
          const totalSections = book.spine.items.length;
          if (totalSections === 0) {
            console.warn("EPUB spine contains no items.");
          }

          for (let i = 0; i < totalSections; i++) {
            const item = book.spine.items[i];
            try {
              console.log(`Loading section ${i + 1}/${totalSections}...`);
              const loadTimeout = 20000;
              const sectionLoadPromise = item.load(book.load.bind(book)).then(sectionContent => {
                if (!sectionContent) {
                  console.warn(`Initial load of section ${item.idref || item.href} returned null. Retrying...`);
                  return item.load(book.load.bind(book)).then(retryContent => {
                    if (!retryContent) throw new Error(`Section ${item.idref || item.href} load resulted in null content after retry.`);
                    return retryContent;
                  });
                }
                return sectionContent;
              });
              const sectionTimeoutPromise = new Promise((_, rejectSectionTimeout) =>
                setTimeout(() => rejectSectionTimeout(new Error(`Loading section ${item.idref || item.href} timed out.`)), loadTimeout)
              );

              const section = await Promise.race([sectionLoadPromise, sectionTimeoutPromise]) as Document | string | any;
              console.log(`Section ${i + 1} loaded. Type: ${typeof section}`);

              let sectionText = '';
              if (section && typeof section.querySelector === 'function') {
                sectionText = extractTextRecursive(section.body || section.documentElement);
                 if (!sectionText && section.documentElement) { // Fallback
                     console.warn(`Falling back to serializing entire documentElement for section ${item.idref || item.href}.`);
                     try {
                         const serializer = new XMLSerializer();
                         const sectionString = serializer.serializeToString(section.documentElement);
                         const parser = new DOMParser();
                         const docFromString = parser.parseFromString(sectionString, item.mediaType || 'text/html' as DOMParserSupportedType);
                         sectionText = extractTextRecursive(docFromString.body || docFromString.documentElement);
                         if (sectionText) console.log("Fallback extraction successful."); else console.warn("Fallback extraction failed.");
                     } catch (serializeError) {
                         console.error("Error during fallback serialization:", serializeError);
                     }
                 }
              } else if (typeof section === 'string') {
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(section, item.mediaType || 'text/html' as DOMParserSupportedType);
                 sectionText = extractTextRecursive(doc.body || doc.documentElement);
                 if(!sectionText) console.warn(`Failed to extract text from string section ${item.idref || item.href}.`);
              } else if (section instanceof Blob || section instanceof ArrayBuffer) {
                 const blob = (section instanceof ArrayBuffer) ? new Blob([section]) : section;
                 const decodedText = await blob.text();
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(decodedText, item.mediaType || 'text/html' as DOMParserSupportedType);
                 sectionText = extractTextRecursive(doc.body || doc.documentElement);
                 if(!sectionText) console.warn(`Decoded binary section ${item.idref || item.href} but failed to extract text.`);
              } else {
                console.warn(`Skipping section ${i + 1} due to unexpected type: ${typeof section}`);
              }

              if (sectionText) {
                sectionText = sectionText.trim();
                if (fullText.length > 0 && !fullText.endsWith('\n\n')) {
                  fullText += '\n\n';
                } else if (fullText.length > 0 && !fullText.endsWith('\n')) {
                  fullText += '\n';
                }
                fullText += sectionText;
              } else {
                console.warn(`Section ${i + 1} parsing yielded no text.`);
              }
            } catch (sectionError: any) {
              console.error(`Error processing section ${i + 1}:`, sectionError.message || sectionError);
              sectionErrors++;
              fullText += `\n\n[Section ${i + 1} Skipped Due To Error: ${sectionError.message || 'Unknown error'}]\n\n`;
            }
          }
          console.log(`Processed ${totalSections} sections with ${sectionErrors} errors.`);

          fullText = fullText.replace(/[ \t]{2,}/g, ' ').replace(/(\r\n|\r|\n)[ \t]*(\r\n|\r|\n)/g, '\n\n').replace(/(\n\n){2,}/g, '\n\n').trim();
          console.log(`Total extracted text length: ${fullText.length}`);

          if (fullText.length === 0 && totalSections > 0) {
             const errorMsg = sectionErrors === totalSections ?
                `Failed to extract any text. All ${totalSections} sections failed.` :
                "EPUB parsing yielded no text. File might be empty, image-based, or DRM protected.";
             console.error(errorMsg);
             reject(new Error(errorMsg));
          } else {
             if (sectionErrors > 0) {
                 console.warn(`EPUB parsed with ${sectionErrors} errors. Content might be incomplete.`);
                 toast({
                   title: 'Parsing Warning',
                   description: `EPUB parsed with ${sectionErrors} error(s). Some content might be missing.`,
                   variant: 'destructive',
                   duration: 5000,
                 });
              } else {
                 console.log("EPUB parsing successful.");
              }
             resolve(fullText);
          }
        } catch (error: any) {
            console.error("Critical EPUB Processing Error:", error);
            let errorMessage = "Error parsing EPUB file.";
            if (isLikelyDrmError(error)) errorMessage += " This file might be DRM-protected.";
            else if (error.message?.includes('File is not a zip file')) errorMessage += " Invalid EPUB format.";
            else if (error.message?.includes('timed out')) errorMessage += ` ${error.message}`;
            else if (error.message) errorMessage += ` Details: ${error.message}`;
            else errorMessage += " Unexpected error.";
            reject(new Error(errorMessage));
        } finally {
            // Dismiss loading toast when done (success or error)
            if (toastId && loadingToast.dismiss) {
                loadingToast.dismiss();
            }
            if (book && typeof book.destroy === 'function') {
                try { book.destroy(); } catch (destroyError) { console.warn("Error destroying book instance:", destroyError); }
            }
        }
    });
   }, [toast, extractTextRecursive]);


  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      console.log(`File selected: ${file.name}`);
      setIsPlaying(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCurrentIndex(0);
      setProgress(0);
      setFileName(file.name);
      setText('');
      setWords([]);
      setActualWordCount(0);

      // Use the ref to store the toast instance
      toastRef.current = toast({ title: 'Loading File...', description: `Processing ${file.name}` });

      try {
         let fileContent = '';
         const lowerCaseName = file.name.toLowerCase();

         if (file.type === 'text/plain' || lowerCaseName.endsWith('.txt')) {
           console.log("Reading TXT file...");
           fileContent = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onload = (e) => e.target?.result ? resolve(e.target.result as string) : reject(new Error("Failed to read TXT."));
             reader.onerror = (e) => reject(new Error(`Error reading TXT: ${reader.error?.message || 'Unknown'}`));
             reader.readAsText(file);
           });
         } else if (lowerCaseName.endsWith('.epub') || file.type === 'application/epub+zip') {
             console.log("Parsing EPUB file...");
             fileContent = await parseEpub(file);
         } else if (lowerCaseName.endsWith('.mobi')) {
            throw new Error(".mobi files are not supported. Please use .txt or .epub.");
         } else {
            throw new Error(`Unsupported file type: "${file.name}". Please use .txt or .epub.`);
         }

         console.log(`File content length: ${fileContent.length}`);
         setText(fileContent);
         const newWords = fileContent.split(/[\s\n]+/).filter(token => token.length > 0);
         console.log(`Extracted ${newWords.length} words/tokens.`);
         setWords(newWords);
         const wordCount = newWords.filter(isActualWord).length;
         setActualWordCount(wordCount);
         console.log(`Counted ${actualWordCount} actual words.`);

         // Dismiss loading toast using the ref
         if (toastRef.current && toastRef.current.dismiss) {
            toastRef.current.dismiss();
         }

         if (newWords.length === 0 && fileContent.length > 0) {
             throw new Error("File loaded, but no words extracted. Check content format.");
         } else if (newWords.length === 0) {
             throw new Error("The file appears to be empty.");
         } else if (wordCount === 0) {
             throw new Error("The file contains no readable words (only punctuation/symbols?).");
         } else {
             toast({ title: 'File Loaded', description: `${file.name} ready.` });
         }
      } catch (error: any) {
         console.error('Error loading file:', error);
         // Dismiss loading toast if it exists
         if (toastRef.current && toastRef.current.dismiss) {
             toastRef.current.dismiss();
         }
         toast({ title: 'Error Loading File', description: error.message || 'Unknown error.', variant: 'destructive', duration: 7000 });
         setFileName(null); setText(''); setWords([]); setActualWordCount(0);
      } finally {
        if (event.target) event.target.value = ''; // Clear file input
        toastRef.current = null; // Clear the toast ref
      }
    },
    [parseEpub, toast]
  );


   // --- Punctuation and Delay Logic ---
   const currentChunkPunctuationInfo = useMemo(() => {
       if (currentIndex >= words.length) return { delayMultiplier: 1.0 };
       const previousTokenIndex = currentIndex - 1;
       if (previousTokenIndex < 0) return { delayMultiplier: 1.0 };

       const previousToken = words[previousTokenIndex];
       const punctuationType = getPunctuationType(previousToken);

       // Apply delay multiplier based on punctuation at the end of the PREVIOUS chunk
       if (punctuationType === 'sentence' || punctuationType === 'clause') {
           console.log(`Applying x3 delay multiplier for ${punctuationType} end.`);
           return { delayMultiplier: 3.0 }; // Triple delay for sentence or clause end
       }

       return { delayMultiplier: 1.0 };
   }, [currentIndex, words]);


  // Function to advance to the next chunk
  const advanceChunk = useCallback(() => {
    // Use findChunkInfo with the current index and target word count
    const { endIndex } = findChunkInfo(currentIndex, chunkWordTarget, words);

    if (endIndex >= words.length) {
        setCurrentIndex(words.length);
        setIsPlaying(false);
        toast({ title: "End of Text", description: "Finished reading." });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
        setCurrentIndex(endIndex);
    }
  }, [currentIndex, words, chunkWordTarget, toast]);


   // Effect to handle the reading timer
   useEffect(() => {
     if (timeoutRef.current) clearTimeout(timeoutRef.current);

     if (isPlaying && words.length > 0 && currentIndex < words.length) {
        const { delayMultiplier } = currentChunkPunctuationInfo;
        // Calculate actual words in the *upcoming* chunk
        const { actualWordsInChunk } = findChunkInfo(currentIndex, chunkWordTarget, words);
        const wordInterval = calculateWordInterval();
        const effectiveWords = Math.max(1, actualWordsInChunk);
        const currentDelay = wordInterval * effectiveWords * delayMultiplier;

        console.log(`Scheduling next chunk. Words: ${actualWordsInChunk}, Interval: ${wordInterval.toFixed(0)}ms, Multiplier: ${delayMultiplier.toFixed(2)}, Delay: ${currentDelay.toFixed(0)}ms`);
        timeoutRef.current = setTimeout(advanceChunk, Math.max(50, currentDelay));
     }

     return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
   }, [ isPlaying, words, currentIndex, advanceChunk, calculateWordInterval, chunkWordTarget, currentChunkPunctuationInfo ]);


   // Update progress based on actual words processed
   useEffect(() => {
    if (actualWordCount > 0) {
        let wordsProcessed = 0;
        for (let i = 0; i < Math.min(currentIndex, words.length); i++) {
            if (isActualWord(words[i])) {
                wordsProcessed++;
            }
        }
        const currentProgress = (wordsProcessed / actualWordCount) * 100;
        setProgress(Math.min(100, Math.max(0, currentProgress)));
    } else {
        setProgress(0);
    }
   }, [currentIndex, words, actualWordCount]);


  const togglePlay = () => {
    if (words.length === 0) {
      toast({ title: 'No Text', description: 'Please upload a file.', variant: 'destructive' });
      return;
    }
     if (currentIndex >= words.length) {
        setCurrentIndex(0); setProgress(0); setIsPlaying(true); toast({title: "Restarting"});
    } else {
         setIsPlaying((prev) => {
             const newState = !prev;
             if (!newState && timeoutRef.current) clearTimeout(timeoutRef.current);
             return newState;
         });
    }
  };

  // --- Navigation ---
   const goToNextChunk = useCallback(() => {
     if (isPlaying) setIsPlaying(false);
     advanceChunk();
   }, [advanceChunk, isPlaying]);

   const goToPreviousChunk = useCallback(() => {
     if (isPlaying) setIsPlaying(false);
     const previousStartIndex = findPreviousChunkStart(currentIndex, chunkWordTarget, words);
     setCurrentIndex(previousStartIndex);
   }, [currentIndex, chunkWordTarget, words, isPlaying]);


  // Find the chunk info for the *current* display
  const { endIndex: currentChunkEndIndex } = findChunkInfo(currentIndex, chunkWordTarget, words);
  const currentTokensForDisplay = words.slice(currentIndex, currentChunkEndIndex);


   const calculatePivot = (token: string): number => {
    if (!token) return 0;
     const len = Math.max(1, token.length);
     return Math.max(0, Math.min(Math.floor(len / 3), len - 1));
   };

  const firstTokenPivotIndex = calculatePivot(currentTokensForDisplay[0] || '');


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Progress value={progress} className="w-full h-1 fixed top-0 left-0 z-20" />
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-5 pb-20 px-4">
        {words.length > 0 ? (
          <ReadingDisplay
            tokens={currentTokensForDisplay}
            pivotIndex={firstTokenPivotIndex}
           />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Upload a .txt or .epub file to begin.</p>
            {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
          </div>
        )}
      </main>
      <ReaderControls
        wpm={wpm}
        setWpm={setWpm}
        chunkWordTarget={chunkWordTarget}
        setChunkWordTarget={setChunkWordTarget}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        onFileUpload={handleFileUpload}
        fileName={fileName}
        goToNextChunk={goToNextChunk}
        goToPreviousChunk={goToPreviousChunk}
        canGoPrevious={currentIndex > 0}
        canGoNext={currentIndex < words.length}
      />
    </div>
  );
}

// Potential Future Enhancements:
// - Loading indicator during file processing/parsing
// - More sophisticated punctuation handling (e.g., different delays for different types)
// - User settings persistence (localStorage)
// - Bookmark/Save progress feature
// - Theme toggle (light/dark)
// - More robust error handling (e.g., for corrupted files)
// - Smoother text display transitions (e.g., fade in/out)
// - Keyboard shortcuts for controls (play/pause, next/prev chunk, settings)
// - Support for more file types (PDF, DOCX - might require server-side processing or heavier libraries)
