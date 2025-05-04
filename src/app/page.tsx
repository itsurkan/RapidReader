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
    allTokens: string[]
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


        // If we reach the target word count *and* the current token isn't punctuation (or it's just clause punctuation without enough following words), check if doubling words gets us closer to punctuation.
        if (wordsInCurrentChunk >= targetWordCount && punctuationFound !== 'sentence') {
            // Dynamic chunk size adjustment: Look ahead
             let lookaheadIndex = currentIndex;
             let lookaheadWords = 0;
             let lookaheadPunctuation: 'sentence' | 'clause' | 'none' = 'none';
             let foundPunctuationAhead = false;

             while(lookaheadIndex < allTokens.length && lookaheadWords < targetWordCount) {
                 const nextToken = allTokens[lookaheadIndex];
                 if (isActualWord(nextToken)) {
                     lookaheadWords++;
                 }
                 lookaheadPunctuation = getPunctuationType(nextToken);
                 if (lookaheadPunctuation === 'sentence' || lookaheadPunctuation === 'clause') {
                     foundPunctuationAhead = true;
                     break;
                 }
                 lookaheadIndex++;
             }

            // If we found punctuation within the next `targetWordCount` words, extend the chunk to include it.
             if (foundPunctuationAhead) {
                // Extend currentIndex to include the punctuation and potentially following tokens if they are part of the same 'unit'
                currentIndex = lookaheadIndex + 1; // Include the token with punctuation
                // Recalculate words in the now potentially longer chunk
                wordsInCurrentChunk = 0;
                for (let i = startIndex; i < currentIndex; i++) {
                    if (isActualWord(allTokens[i])) {
                        wordsInCurrentChunk++;
                    }
                }
                 break; // Break after extending
             } else {
                // If no punctuation found soon, just break at the current target word count.
                 // Only break here if no significant punctuation was found in *this* token itself.
                 if (punctuationFound === 'none') {
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

     // Ensure at least one token is always included if possible, even if it exceeds target count slightly due to punctuation rule.
     const finalEndIndex = (endIndex === startIndex && startIndex < allTokens.length) ? startIndex + 1 : endIndex;

    // Recalculate actual words for the *final* chunk
    let finalActualWordsCount = 0;
    for (let i = startIndex; i < finalEndIndex; i++) {
        if (isActualWord(allTokens[i])) {
            finalActualWordsCount++;
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

    let wordsToGoBack = targetWordCount;
    let previousIndex = currentStartIndex - 1;
    let actualWordsFound = 0;
    let sentencePunctuationMet = false;

    // First pass: Go back roughly targetWordCount actual words, stopping at sentence punctuation
    while (previousIndex >= 0 && actualWordsFound < targetWordCount) {
        const token = allTokens[previousIndex];
        if (isActualWord(token)) {
            actualWordsFound++;
        }
        if (getPunctuationType(token) === 'sentence' && actualWordsFound > 0) {
             sentencePunctuationMet = true;
             previousIndex++; // Start *after* the sentence punctuation
            break;
        }
        previousIndex--;
    }

    // If we stopped exactly at the beginning, return 0
    if (previousIndex < 0) return 0;

     // If we stopped due to sentence punctuation, start the chunk from there.
     if (sentencePunctuationMet) {
         return previousIndex;
     }


    // If we went back roughly targetWordCount without hitting sentence end,
    // we now need to find the *start* of the chunk containing this `previousIndex`.
    // We do this by simulating `findChunkInfo` starting from the beginning until it includes `previousIndex`.
    let simulatedStartIndex = 0;
    let lastValidStartIndex = 0;
    while (simulatedStartIndex <= previousIndex) {
         lastValidStartIndex = simulatedStartIndex;
         const { endIndex } = findChunkInfo(simulatedStartIndex, targetWordCount, allTokens);
         if (endIndex <= simulatedStartIndex) break; // Avoid infinite loop if findChunkInfo stalls
         simulatedStartIndex = endIndex;
    }

    // The start of the previous chunk is the last valid start index we found
    return lastValidStartIndex;
};


export default function Home() {
  const [text, setText] = useState<string>('');
  const [tokens, setTokens] = useState<string[]>([]); // Tokens are now split by whitespace
  const [actualWordCount, setActualWordCount] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0); // Index in the tokens array
  const [wpm, setWpm] = useState<number>(300);
  const [chunkWordTarget, setChunkWordTarget] = useState<number>(2); // Target *approximate words* per chunk display
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isAdjustingChunk, setIsAdjustingChunk] = useState<boolean>(false); // Maybe reuse later if needed

  // Ref for managing setTimeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast, dismiss } = useToast();

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

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          console.error("FileReader onload event triggered, but e.target.result is null or undefined.");
          return reject(new Error("Failed to read EPUB file content (FileReader result was empty)."));
        }
        try {
          console.log("FileReader successful, attempting to load EPUB...");
          const arrayBuffer = e.target.result as ArrayBuffer;
          console.log(`EPUB ArrayBuffer size: ${arrayBuffer.byteLength}`);

          // Explicitly pass encoding option
          book = Epub(arrayBuffer, { encoding: 'binary' }); // or 'base64' if that's how you read it, binary often works

          book.on('book:error', (err: any) => {
            console.error('EPUB Book Error Event:', err);
            reject(new Error(`EPUB loading error: ${err.message || 'Unknown error during book initialization.'} ${isLikelyDrmError(err) ? ' (Possible DRM)' : ''}`));
          });

          console.log("EPUB instance created, awaiting book.ready...");

          // Increased timeout for book.ready as it can take time for larger/complex EPUBs
          const readyTimeout = 45000; // 45 seconds
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
                console.warn("EPUB spine contains no items. The book might be empty or structured incorrectly.");
           }

          for (let i = 0; i < totalSections; i++) {
            const item = book.spine.items[i];
            try {
                console.log(`Loading section ${i + 1}/${totalSections} (ID: ${item.idref || 'unknown'}, Href: ${item.href})...`);

                // Increased timeout per section
                const loadTimeout = 20000; // 20 seconds per section
                const sectionLoadPromise = item.load(book.load.bind(book)).then(sectionContent => {
                    if (!sectionContent) {
                        // Try reloading once on null content, could be a transient issue
                        console.warn(`Initial load of section ${item.idref || item.href} returned null. Retrying...`);
                        return item.load(book.load.bind(book)).then(retryContent => {
                            if (!retryContent) {
                                throw new Error(`Section ${item.idref || item.href} load resulted in null or undefined content even after retry.`);
                            }
                            return retryContent;
                        });
                    }
                    return sectionContent;
                });


                const sectionTimeoutPromise = new Promise((_, rejectSectionTimeout) =>
                  setTimeout(() => rejectSectionTimeout(new Error(`Loading section ${item.idref || item.href} timed out after ${loadTimeout / 1000} seconds.`)), loadTimeout)
                );

                const section = await Promise.race([sectionLoadPromise, sectionTimeoutPromise]) as Document | string | any;

                console.log(`Section ${item.idref || item.href} loaded. Type: ${typeof section}`);

                let sectionText = '';
                if (section && typeof (section as any).querySelector === 'function') {
                    // Prioritize extracting from body, but have fallbacks
                    const body = (section as Document).body;
                    const docElement = (section as Document).documentElement;

                    if (body) {
                        console.log(`Extracting text from body of section ${item.idref || item.href}.`);
                        sectionText = extractTextRecursive(body);
                    } else if (docElement) {
                        console.warn(`Section ${item.idref || item.href} loaded but body element not found. Trying documentElement.`);
                        sectionText = extractTextRecursive(docElement);
                    }
                    // Add a fallback to serialize the whole section if body/documentElement fails
                     if (!sectionText && docElement) {
                         console.warn(`Falling back to serializing entire documentElement for section ${item.idref || item.href}.`);
                         try {
                            const serializer = new XMLSerializer();
                            const sectionString = serializer.serializeToString(docElement);
                             const parser = new DOMParser();
                             const docFromString = parser.parseFromString(sectionString, 'text/html');
                             sectionText = extractTextRecursive(docFromString.body || docFromString.documentElement);
                             if (sectionText) console.log("Fallback serialization extraction successful.");
                             else console.warn("Fallback serialization extraction failed.");
                         } catch (serializeError) {
                             console.error("Error during fallback serialization:", serializeError);
                         }
                     }


                    if (!sectionText) {
                         console.warn(`Initial extraction failed for section ${item.idref || item.href}. No text extracted from DOM structure.`);
                    }

                } else if (typeof section === 'string') {
                    console.warn(`Section ${item.idref || item.href} loaded as a string. Attempting basic HTML parse.`);
                    const parser = new DOMParser();
                    // Ensure parsing as text/html or application/xhtml+xml based on item's media type if available
                    const mediaType = item.mediaType || 'text/html';
                    const doc = parser.parseFromString(section, mediaType as DOMParserSupportedType);
                    sectionText = extractTextRecursive(doc.body || doc.documentElement);
                    if(sectionText) {
                       console.log(`Extracted text from string-based section ${item.idref || item.href}.`);
                    } else {
                       console.warn(`Failed to extract text from string-based section ${item.idref || item.href}. Content might be non-HTML or empty.`);
                    }
                } else if (section instanceof Blob || section instanceof ArrayBuffer) {
                    console.warn(`Section ${item.idref || item.href} loaded as Blob/ArrayBuffer. Attempting text decode.`);
                    try {
                        const blob = (section instanceof ArrayBuffer) ? new Blob([section]) : section;
                        const decodedText = await blob.text(); // Assumes UTF-8, might need encoding detection
                         const parser = new DOMParser();
                          const mediaType = item.mediaType || 'text/html';
                         const doc = parser.parseFromString(decodedText, mediaType as DOMParserSupportedType);
                         sectionText = extractTextRecursive(doc.body || doc.documentElement);
                         if(sectionText) {
                           console.log(`Successfully decoded and extracted text from binary section ${item.idref || item.href}.`);
                         } else {
                             console.warn(`Decoded binary section ${item.idref || item.href} but failed to extract meaningful text.`);
                         }
                    } catch (decodeError) {
                         console.error(`Failed to decode or parse binary section ${item.idref || item.href}:`, decodeError);
                    }

                } else {
                    console.warn(`Skipping section ${item.idref || item.href} due to unexpected content type:`, typeof section, section);
                }

                 if (sectionText) {
                    // Trim section text first before checking/adding separators
                    sectionText = sectionText.trim();
                     if (fullText.length > 0 && !fullText.endsWith('\n\n')) {
                         // Add a double newline if the previous text didn't end with one
                         fullText += '\n\n';
                     } else if (fullText.length > 0 && !fullText.endsWith('\n')) {
                          // Add a single newline if the previous text didn't end with any newline
                          // This case might be less common due to extractTextRecursive's block handling
                         fullText += '\n';
                     }
                     fullText += sectionText; // Append the trimmed section text
                 } else {
                     console.warn(`Section ${item.idref || item.href} parsing yielded no text.`);
                 }

            } catch (sectionError: any) {
                console.error(`Error processing section ${i + 1}/${totalSections} (ID: ${item.idref || item.href}):`, sectionError.message || sectionError);
                sectionErrors++;
                 fullText += `\n\n[Section "${item.idref || item.href || 'Unknown'}" Skipped Due To Error: ${sectionError.message || 'Unknown error'}]\n\n`;
            }
          }
          console.log(`Finished processing ${totalSections} sections with ${sectionErrors} errors.`);

           // Post-processing cleanup
           fullText = fullText.replace(/[ \t]{2,}/g, ' '); // Consolidate multiple spaces/tabs
           fullText = fullText.replace(/(\r\n|\r|\n)[ \t]*(\r\n|\r|\n)/g, '\n\n'); // Normalize paragraph breaks
           fullText = fullText.replace(/(\n\n){2,}/g, '\n\n'); // Consolidate multiple paragraph breaks
           fullText = fullText.trim();
           console.log(`Extracted text length (after cleanup): ${fullText.length}`);

           if (fullText.length === 0 && totalSections > 0 && sectionErrors === totalSections) {
                console.error("EPUB parsing failed completely. All sections encountered errors.");
               reject(new Error(`Failed to extract any text content. All ${totalSections} sections failed to load or parse.`));
           } else if (fullText.length === 0 && totalSections > 0) {
                console.warn("EPUB parsing resulted in zero text content, though some sections might have loaded without errors. The file might be empty, contain only images/unparsable content, or be DRM protected.");
                 reject(new Error("Failed to extract any readable text from the EPUB. It might be image-based, empty, or DRM protected."));
           }
           else {
                if (sectionErrors > 0) {
                   console.warn(`EPUB parsed with ${sectionErrors} section error(s). Extracted text might be incomplete.`);
                   toast({
                     title: 'Parsing Warning',
                     description: `EPUB parsed with ${sectionErrors} error(s). Some content might be missing or skipped.`,
                     variant: 'destructive',
                     duration: 5000,
                   });
                } else {
                   console.log("EPUB parsing and text extraction successful.");
                }
                resolve(fullText);
           }

        } catch (error: any) {
            console.error("Critical EPUB Processing Error:", error);
            let errorMessage = "Error parsing EPUB file.";

            if (isLikelyDrmError(error)) {
                 errorMessage += " This file might be DRM-protected, which is not supported.";
                 console.error("Detected potential DRM protection.");
            } else if (error.message?.includes('File is not a zip file') || error.name === 'SyntaxError') {
                errorMessage += " The file appears corrupted or is not a valid EPUB (ZIP archive).";
                console.error("EPUB file seems corrupted or invalid format.");
            } else if (error.message?.includes('timed out')) {
                 errorMessage += ` ${error.message}`;
                 console.error("EPUB processing timed out.");
            }
            else if (error.message) {
                 errorMessage += ` Details: ${error.message}`;
            } else {
                 errorMessage += " It might be corrupted, in an unsupported format, or have internal structure issues.";
            }
             if (book && typeof book.destroy === 'function') {
                 try { book.destroy(); } catch (err) { console.warn("Error destroying book after critical error:", err); }
             }
            reject(new Error(errorMessage));
        } finally {
             try {
                if (book && typeof book.destroy === 'function') {
                    console.log("Destroying epubjs book instance...");
                    book.destroy();
                    console.log("Book instance destroyed.");
                } else {
                    console.log("No book instance to destroy or destroy method not available.");
                }
             } catch (destroyError) {
                console.warn("Error destroying epubjs book instance:", destroyError);
             }
        }
      };
      reader.onerror = (e) => {
        console.error("FileReader error:", reader.error);
        if (book && typeof book.destroy === 'function') {
            try { book.destroy(); } catch (err) { console.warn("Error destroying book after FileReader error:", err); }
        }
        reject(new Error(`Error reading the file using FileReader: ${reader.error?.message || 'Unknown FileReader error'}`));
      };
      reader.onabort = (e) => {
        console.warn("FileReader operation aborted.");
        if (book && typeof book.destroy === 'function') {
             try { book.destroy(); } catch (err) { console.warn("Error destroying book after FileReader abort:", err); }
         }
        reject(new Error("File reading was aborted."));
      }

      console.log(`Starting FileReader for ${file.name}...`);
      reader.readAsArrayBuffer(file);
    });
   }, [toast, extractTextRecursive]); // Removed 'dismiss' as it's called directly now


  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
          console.log("No file selected.");
          return;
      }

       console.log(`File selected: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);

      setIsPlaying(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCurrentIndex(0);
      setProgress(0);
      setFileName(file.name);
      setText('');
      setTokens([]);
      setActualWordCount(0);
      setIsAdjustingChunk(false);

      // Get dismiss function and ID *before* potential async operations
      const loadingToast = toast({ title: 'Loading File...', description: `Processing ${file.name}` });

      try {
         let fileContent = '';
         console.log(`Checking file type for ${file.name}...`);
         const lowerCaseName = file.name.toLowerCase();

         if (file.type === 'text/plain' || lowerCaseName.endsWith('.txt')) {
           console.log("Detected text file.");
           const reader = new FileReader();
           fileContent = await new Promise<string>((resolve, reject) => {
             reader.onload = (e) => {
                 if (e.target?.result) {
                     console.log("TXT file read successfully.");
                     resolve(e.target.result as string);
                 } else {
                     console.error("FileReader onload for TXT, but result is empty.");
                     reject(new Error("Failed to read TXT file content."));
                 }
             };
             reader.onerror = (e) => {
                  console.error("FileReader error reading TXT:", reader.error);
                 reject(new Error(`Error reading TXT file: ${reader.error?.message || 'Unknown error'}`));
             };
             console.log("Reading TXT file as text...");
             reader.readAsText(file);
           });
         } else if (lowerCaseName.endsWith('.epub') || file.type === 'application/epub+zip') {
             console.log("Detected EPUB file. Calling parseEpub...");
             fileContent = await parseEpub(file);
             console.log("parseEpub completed.");
         } else if (lowerCaseName.endsWith('.mobi')) {
            console.warn("Unsupported file type: .mobi");
            loadingToast.dismiss(); // Dismiss loading toast
            toast({
             title: 'Unsupported Format',
             description: '.mobi files are not currently supported. Please try .txt or .epub.',
             variant: 'destructive',
           });
           setFileName(null);
           return;
         } else {
            console.warn(`Unsupported file type: ${file.type} / ${file.name}`);
            loadingToast.dismiss(); // Dismiss loading toast
           toast({
             title: 'Unsupported File Type',
             description: `"${file.name}" is not a supported .txt or .epub file.`,
             variant: 'destructive',
           });
            setFileName(null);
           return;
         }

         console.log(`File content length: ${fileContent.length}`);
         setText(fileContent);
         // Tokenize by whitespace (including newlines)
         const newTokens = fileContent.split(/[\s\n]+/).filter(token => token.length > 0);
         console.log(`Extracted ${newTokens.length} tokens (split by whitespace).`);
         setTokens(newTokens);

         // Count actual words (alphanumeric sequences)
         const wordCount = newTokens.filter(isActualWord).length;
         setActualWordCount(wordCount);
         console.log(`Counted ${wordCount} actual words.`);

         // Explicitly dismiss the loading toast *before* showing success/error
          loadingToast.dismiss(); // Use the function obtained earlier


         if (newTokens.length === 0 && fileContent.length > 0) {
             console.warn("File loaded, but no tokens extracted after splitting. Check content format.");
            toast({
             title: 'Parsing Issue',
             description: 'File loaded, but no words/elements were extracted after splitting. Check content format or potential errors.',
             variant: 'destructive',
           });
         } else if (newTokens.length === 0) {
              console.warn("The loaded file appears to be empty or contains no readable text.");
             toast({
             title: 'Empty File',
             description: 'The loaded file appears to be empty or contains no readable text.',
              variant: 'destructive',
           });
         } else if (wordCount === 0 && newTokens.length > 0) {
             console.warn("Tokens extracted, but no actual words found (only punctuation/symbols?).");
             toast({
                 title: 'No Words Found',
                 description: 'The file seems to contain only punctuation or symbols, no readable words were found.',
                 variant: 'destructive',
             });
         } else {
             console.log("File loaded and tokens extracted successfully.");
             toast({
               title: 'File Loaded',
               description: `${file.name} is ready for reading.`,
             });
         }
      } catch (error: any) {
         console.error('Error during file processing or parsing:', error);
          // Dismiss loading toast first, then show error
          loadingToast.dismiss(); // Use the function obtained earlier
          toast({
           title: 'Error Loading File',
           description: error.message || 'An unexpected error occurred. Check console.',
           variant: 'destructive',
            duration: 7000,
         });
         setFileName(null);
         setText('');
         setTokens([]);
         setActualWordCount(0);
      } finally {
        console.log("File upload handling finished.");
        if (event.target) {
            event.target.value = '';
        }
      }
    },
    [parseEpub, toast, dismiss] // Add dismiss here
  );


   // --- Punctuation and Delay Logic ---
   const currentChunkPunctuationInfo = useMemo(() => {
       if (currentIndex >= tokens.length) return { delayMultiplier: 1.0 };

       // Check the last token of the *previous* chunk (which is currentIndex - 1)
       const previousTokenIndex = currentIndex - 1;
       if (previousTokenIndex < 0) return { delayMultiplier: 1.0 }; // No previous token

       const previousToken = tokens[previousTokenIndex];
       const punctuationType = getPunctuationType(previousToken);

        // Apply delay multiplier based on the punctuation at the end of the PREVIOUS chunk
       if (punctuationType === 'sentence' || punctuationType === 'clause') {
           console.log(`Applying x3 delay multiplier for ${punctuationType} end.`);
           return { delayMultiplier: 3.0 }; // Triple delay after ., !, ?, ,, ;, :
       }

       return { delayMultiplier: 1.0 }; // Default multiplier
   }, [currentIndex, tokens]);


  // Function to advance to the next chunk based on the *new* findChunkInfo logic
  const advanceChunk = useCallback(() => {
    // Use findChunkInfo to get the end index of the next logical chunk
    const { endIndex } = findChunkInfo(currentIndex, chunkWordTarget, tokens);

    if (endIndex >= tokens.length) {
        setCurrentIndex(tokens.length);
        setIsPlaying(false);
        toast({ title: "End of Text", description: "Finished reading." });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
        setCurrentIndex(endIndex); // Move to the start of the next chunk
    }
  }, [currentIndex, tokens, chunkWordTarget, toast]);


   // Effect to handle the reading timer using setTimeout for dynamic delays
   useEffect(() => {
     if (timeoutRef.current) {
       clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
     }

     if (isPlaying && tokens.length > 0 && currentIndex < tokens.length) {
        // Get the delay multiplier based on the punctuation of the *previous* chunk
        const { delayMultiplier } = currentChunkPunctuationInfo;

        // Calculate the actual number of words in the *upcoming* chunk
        const { actualWordsInChunk } = findChunkInfo(currentIndex, chunkWordTarget, tokens);

        // Calculate base interval per word
        const wordInterval = calculateWordInterval();

        // Calculate delay: interval per word * actual words in this chunk * punctuation multiplier
        const effectiveWords = Math.max(1, actualWordsInChunk); // Ensure at least 1 word contributes to delay
        let currentDelay = wordInterval * effectiveWords * delayMultiplier;

       // Schedule the next advanceChunk call
       console.log(`Scheduling next chunk. Target Words: ${chunkWordTarget}, Actual Words: ${actualWordsInChunk}, Word Interval: ${wordInterval.toFixed(0)}ms, Punctuation Multiplier: ${delayMultiplier.toFixed(2)}, Final Delay: ${currentDelay.toFixed(0)}ms`);
       timeoutRef.current = setTimeout(advanceChunk, Math.max(50, currentDelay)); // Ensure minimum delay
     }

     // Cleanup function
     return () => {
       if (timeoutRef.current) {
         clearTimeout(timeoutRef.current);
         timeoutRef.current = null;
       }
     };
   }, [
       isPlaying,
       tokens,
       currentIndex,
       advanceChunk,
       calculateWordInterval,
       chunkWordTarget, // Depend on the target word count
       currentChunkPunctuationInfo, // Depend on punctuation info
     ]);


   useEffect(() => {
    if (actualWordCount > 0) {
        let wordsProcessed = 0;
        for (let i = 0; i < Math.min(currentIndex, tokens.length); i++) {
            if (isActualWord(tokens[i])) {
                wordsProcessed++;
            }
        }
        const currentProgress = (wordsProcessed / actualWordCount) * 100;
        setProgress(Math.min(100, Math.max(0, currentProgress)));
    } else {
        setProgress(0);
    }
   }, [currentIndex, tokens, actualWordCount]);


  const togglePlay = () => {
    if (tokens.length === 0) {
      toast({
        title: 'No Text Loaded',
        description: 'Please upload a file.',
        variant: 'destructive',
      });
      return;
    }
     if (currentIndex >= tokens.length) {
        setCurrentIndex(0);
        setProgress(0);
        setIsPlaying(true);
        toast({title: "Restarting Reading"});
    } else {
         setIsPlaying((prev) => {
             const newState = !prev;
             if (!newState && timeoutRef.current) {
                 clearTimeout(timeoutRef.current);
                 timeoutRef.current = null;
                 console.log("Playback paused, timer cleared.");
             } else if (newState) {
                 console.log("Playback started/resumed.");
             }
             return newState;
         });
    }
  };

  // --- Navigation ---
   const goToNextChunk = useCallback(() => {
     if (isPlaying) setIsPlaying(false); // Pause on manual navigation
     advanceChunk();
   }, [advanceChunk, isPlaying]);

   const goToPreviousChunk = useCallback(() => {
     if (isPlaying) setIsPlaying(false); // Pause on manual navigation
     const previousStartIndex = findPreviousChunkStart(currentIndex, chunkWordTarget, tokens);
     setCurrentIndex(previousStartIndex);
   }, [currentIndex, chunkWordTarget, tokens, isPlaying]);


  // Find the chunk info for the *current* display using the new logic
  const { endIndex: currentChunkEndIndex } = findChunkInfo(currentIndex, chunkWordTarget, tokens);
  const currentTokensForDisplay = tokens.slice(currentIndex, currentChunkEndIndex);


   const calculatePivot = (token: string): number => {
    if (!token) return 0;
     const len = Math.max(1, token.length);
     return Math.max(0, Math.min(Math.floor(len / 3), len - 1));
   };

  // Pivot based on the first token of the current display chunk
  const firstTokenPivotIndex = calculatePivot(currentTokensForDisplay[0] || '');


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Progress value={progress} className="w-full h-1 fixed top-0 left-0 z-20" />
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-5 pb-20 px-4">
        {tokens.length > 0 ? (
          <ReadingDisplay
            tokens={currentTokensForDisplay}
            pivotIndex={firstTokenPivotIndex}
            isAdjusted={isAdjustingChunk} // Reuse this flag or remove if not needed
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
        chunkWordTarget={chunkWordTarget} // Pass target word count
        setChunkWordTarget={setChunkWordTarget} // Setter for target
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        onFileUpload={handleFileUpload}
        fileName={fileName}
        goToNextChunk={goToNextChunk} // Pass navigation function
        goToPreviousChunk={goToPreviousChunk} // Pass navigation function
        canGoPrevious={currentIndex > 0} // Determine if previous is possible
        canGoNext={currentIndex < tokens.length} // Determine if next is possible
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
