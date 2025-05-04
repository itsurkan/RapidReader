
'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Book } from 'epubjs'; // Import epubjs types only
import { ReaderControls } from '@/components/reader-controls';
import { ReadingDisplay } from '@/components/reading-display';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast'; // Correct import
import { cn } from '@/lib/utils';

// Helper function to check if an error might be related to DRM
function isLikelyDrmError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  // Keywords often associated with DRM issues in epubjs or related contexts
  return message.includes('encrypted') || message.includes('decryption') || message.includes('content protection');
}


export default function Home() {
  const [text, setText] = useState<string>('');
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [wpm, setWpm] = useState<number>(300);
  const [wordsPerDisplay, setWordsPerDisplay] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isAdjustingChunk, setIsAdjustingChunk] = useState<boolean>(false);

  // Ref for managing setTimeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast, dismiss } = useToast(); // Destructure dismiss function

  // Function to calculate base interval delay based on WPM and wordsPerDisplay
  const calculateBaseInterval = useCallback(() => {
    const effectiveWpm = Math.max(1, wpm);
    // Calculate delay per word, then multiply by words per display
    return (60 / effectiveWpm) * 1000 * Math.max(1, wordsPerDisplay);
  }, [wpm, wordsPerDisplay]);


   // Simplified recursive function to extract text, adding paragraph breaks
   const extractTextRecursive = useCallback((node: Node): string => {
       let currentText = '';
       if (!node) return '';

       if (node.nodeType === Node.TEXT_NODE) {
           // Append trimmed text node content
           const trimmed = node.textContent?.trim();
           if (trimmed) {
               // Add a space only if the current text isn't empty and doesn't end with whitespace
               if (currentText.length > 0 && !/[\s\n]$/.test(currentText)) {
                    currentText += ' ';
               }
               currentText += trimmed;
           }
       } else if (node.nodeType === Node.ELEMENT_NODE) {
           const element = node as HTMLElement;
           const tagName = element.tagName.toUpperCase();
           // Consider common block-level elements for paragraph breaks
           const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV'].includes(tagName);
            const isLineBreak = tagName === 'BR';

           // Add break *before* processing children of a block element, if text exists and doesn't already end with a double break
           if (isBlock && currentText.length > 0 && !currentText.endsWith('\n\n')) {
                // Prefer double newline, but settle for single if already ending with single
               currentText += currentText.endsWith('\n') ? '\n' : '\n\n';
           }

           for (let i = 0; i < node.childNodes.length; i++) {
                const childText = extractTextRecursive(node.childNodes[i]);
                // Append child text, adding space if necessary
                if (childText) {
                    if (currentText.length > 0 && !/[\s\n]$/.test(currentText) && !/^[.,!?;:]/.test(childText)) {
                        currentText += ' ';
                    }
                    currentText += childText;
                }
           }

            // Add break *after* processing children of a block element or BR, if text was added and doesn't end with double break
           if ((isBlock || isLineBreak) && currentText.length > 0 && !currentText.endsWith('\n\n')) {
                 currentText += currentText.endsWith('\n') ? '\n' : '\n\n';
           }
       }
       return currentText;
   }, []); // No external dependencies needed for this pure function logic


  const parseEpub = useCallback(async (file: File): Promise<string> => {
    // Dynamically import epubjs only when needed
    const Epub = (await import('epubjs')).default;
    let book: Book | null = null; // Keep track of the book instance for cleanup

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          console.error("FileReader onload event triggered, but e.target.result is null or undefined.");
          return reject(new Error("Failed to read EPUB file content (FileReader result was empty)."));
        }
        try {
          console.log("FileReader successful, attempting to load EPUB...");
          // Use ArrayBuffer directly
          const arrayBuffer = e.target.result as ArrayBuffer;
          console.log(`EPUB ArrayBuffer size: ${arrayBuffer.byteLength}`);

          // Instantiate Epub with the ArrayBuffer
          book = Epub(arrayBuffer, { encoding: 'binary' }); // Try adding encoding option

          // Listen for book:error event which might indicate DRM or corruption early
          book.on('book:error', (err: any) => {
            console.error('EPUB Book Error Event:', err);
            // Explicitly reject on critical errors signaled by the book itself
            reject(new Error(`EPUB loading error: ${err.message || 'Unknown error during book initialization.'} ${isLikelyDrmError(err) ? ' (Possible DRM)' : ''}`));
          });

          console.log("EPUB instance created, awaiting book.ready...");

          // Wrap book.ready in a timeout mechanism
          const readyTimeout = 30000; // 30 seconds timeout for book.ready
          const readyPromise = book.ready;
          const timeoutPromise = new Promise((_, rejectTimeout) =>
            setTimeout(() => rejectTimeout(new Error(`EPUB book.ready timed out after ${readyTimeout / 1000} seconds.`)), readyTimeout)
          );

          await Promise.race([readyPromise, timeoutPromise]);
          // If we reached here, book.ready resolved before the timeout

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

                // Attempt to load the section's content as a Document
                // Add timeout for section loading as well
                const loadTimeout = 15000; // 15 seconds per section
                const sectionLoadPromise = item.load(book.load.bind(book)).then(sectionContent => {
                    if (!sectionContent) {
                        throw new Error(`Section ${item.idref || item.href} load resulted in null or undefined content.`);
                    }
                    return sectionContent;
                });

                const sectionTimeoutPromise = new Promise((_, rejectSectionTimeout) =>
                  setTimeout(() => rejectSectionTimeout(new Error(`Loading section ${item.idref || item.href} timed out after ${loadTimeout / 1000} seconds.`)), loadTimeout)
                );

                const section = await Promise.race([sectionLoadPromise, sectionTimeoutPromise]) as Document | string | any; // Be more flexible with the type initially

                console.log(`Section ${item.idref || item.href} loaded. Type: ${typeof section}`);

                let sectionText = '';
                if (section && typeof (section as any).querySelector === 'function') { // Check if it behaves like a Document/Element
                    const body = (section as Document).body;
                    if (body) {
                        console.log(`Extracting text from body of section ${item.idref || item.href}.`);
                        sectionText = extractTextRecursive(body);
                    } else {
                        console.warn(`Section ${item.idref || item.href} loaded but body element not found. Trying documentElement.`);
                        sectionText = extractTextRecursive((section as Document).documentElement);
                         if (sectionText) {
                             console.log(`Fallback extraction for section ${item.idref || item.href} successful.`);
                         } else {
                             console.warn(`Fallback extraction failed for section ${item.idref || item.href}. No text extracted.`);
                         }
                    }
                } else if (typeof section === 'string') {
                    // Handle cases where the section loads as raw HTML string
                    console.warn(`Section ${item.idref || item.href} loaded as a string. Attempting basic HTML parse.`);
                    // Use DOMParser for safer parsing than innerHTML
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(section, item.mediaType || 'text/html'); // Use mediaType if available
                    sectionText = extractTextRecursive(doc.body || doc.documentElement);
                    if(sectionText) {
                       console.log(`Extracted text from string-based section ${item.idref || item.href}.`);
                    } else {
                       console.warn(`Failed to extract text from string-based section ${item.idref || item.href}.`);
                    }
                } else if (section instanceof Blob || section instanceof ArrayBuffer) {
                    // Attempt to decode if it's binary data (e.g., an image mistakenly in spine?)
                    console.warn(`Section ${item.idref || item.href} loaded as Blob/ArrayBuffer. Attempting text decode.`);
                    try {
                        const blob = (section instanceof ArrayBuffer) ? new Blob([section]) : section;
                        const decodedText = await blob.text();
                        // If it decodes, try parsing as HTML
                         const parser = new DOMParser();
                         const doc = parser.parseFromString(decodedText, item.mediaType || 'text/html');
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
                     // Add double newline between sections for clarity, only if text exists
                     fullText += sectionText.trim() + '\n\n';
                 } else {
                     console.warn(`Section ${item.idref || item.href} parsing yielded no text.`);
                     // Only count as error if loading *didn't* error but no text came out
                     // sectionErrors++; Let's not count empty sections as errors for now
                 }

            } catch (sectionError: any) {
                console.error(`Error processing section ${i + 1}/${totalSections} (ID: ${item.idref || item.href}):`, sectionError.message || sectionError);
                sectionErrors++;
                 // Add a marker for skipped sections
                 fullText += `\n\n[Section "${item.idref || item.href || 'Unknown'}" Skipped Due To Error: ${sectionError.message || 'Unknown error'}]\n\n`;
            }
          }
          console.log(`Finished processing ${totalSections} sections with ${sectionErrors} errors.`);

           // Clean up excessive whitespace and line breaks more carefully
           fullText = fullText.replace(/[ \t]{2,}/g, ' '); // Consolidate multiple spaces/tabs to single space
           fullText = fullText.replace(/(\r\n|\r|\n)[ \t]*(\r\n|\r|\n)/g, '\n\n'); // Consolidate multiple newlines (with optional space in between) to max 2
           fullText = fullText.replace(/(\n\n){2,}/g, '\n\n'); // Ensure max 2 consecutive newlines
           fullText = fullText.trim(); // Trim leading/trailing whitespace
           console.log(`Extracted text length (after cleanup): ${fullText.length}`);

           if (fullText.length === 0 && totalSections > 0 && sectionErrors === totalSections) {
               // If no text was extracted AT ALL, and ALL sections errored out, then reject.
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
                     variant: 'destructive', // Use 'destructive' style for warnings too
                     duration: 5000, // Make warning slightly longer
                   });
                } else {
                   console.log("EPUB parsing and text extraction successful.");
                }
                resolve(fullText); // Resolve even if there were non-critical errors or partial content
           }

        } catch (error: any) { // Catch errors during initial book loading or overall process
            console.error("Critical EPUB Processing Error:", error);
            let errorMessage = "Error parsing EPUB file.";

            if (isLikelyDrmError(error)) {
                 errorMessage += " This file might be DRM-protected, which is not supported.";
                 console.error("Detected potential DRM protection.");
            } else if (error.message?.includes('File is not a zip file') || error.name === 'SyntaxError') {
                errorMessage += " The file appears corrupted or is not a valid EPUB (ZIP archive).";
                console.error("EPUB file seems corrupted or invalid format.");
            } else if (error.message?.includes('timed out')) {
                 errorMessage += ` ${error.message}`; // Include the timeout message
                 console.error("EPUB processing timed out.");
            }
            else if (error.message) {
                 errorMessage += ` Details: ${error.message}`;
            } else {
                 errorMessage += " It might be corrupted, in an unsupported format, or have internal structure issues.";
            }
            reject(new Error(errorMessage)); // Reject on critical initial loading errors
        } finally {
             // Clean up the book instance to free resources
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
        // Ensure book cleanup if FileReader fails after book might have been initialized (less likely path)
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
      reader.readAsArrayBuffer(file); // Use readAsArrayBuffer for epubjs
    });
   }, [toast, extractTextRecursive]); // extractTextRecursive is memoized


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
      setWords([]);
      setIsAdjustingChunk(false); // Reset adaptive chunk state

      const toastResult = toast({ title: 'Loading File...', description: `Processing ${file.name}` });
      const loadingToastId = toastResult.id;

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
            if (loadingToastId && dismiss) dismiss(loadingToastId); // Dismiss loading toast
            toast({
             title: 'Unsupported Format',
             description: '.mobi files are not currently supported. Please try .txt or .epub.',
             variant: 'destructive',
           });
           setFileName(null);
           return;
         } else {
            console.warn(`Unsupported file type: ${file.type} / ${file.name}`);
            if (loadingToastId && dismiss) dismiss(loadingToastId); // Dismiss loading toast
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
         // Improved word splitting: Handles hyphenated words, contractions, and keeps punctuation separate or attached.
         // Matches sequences of word characters (incl. hyphens, apostrophes) OR single punctuation marks.
         const newWords = fileContent.match(/[\p{L}\p{N}'-]+|[.,!?;:]+|\S/gu) || [];
         // const newWords = fileContent.split(/[\s\n]+/).filter(Boolean); // Original simple split
         console.log(`Extracted ${newWords.length} words/tokens.`);
         setWords(newWords);

         // Explicitly dismiss the loading toast *before* showing success/error
         if (loadingToastId && dismiss) dismiss(loadingToastId);


         if (newWords.length === 0 && fileContent.length > 0) {
             console.warn("File loaded, but no words extracted. Content might be structured unusually or contain skipped sections.");
            toast({
             title: 'Parsing Issue',
             description: 'File loaded, but few/no words were extracted. Check content format or potential errors during parsing.',
             variant: 'destructive',
           });
         } else if (newWords.length === 0) {
              console.warn("The loaded file appears to be empty or contains no readable text.");
             toast({
             title: 'Empty File',
             description: 'The loaded file appears to be empty or contains no readable text.',
              variant: 'destructive',
           });
         } else {
             console.log("File loaded and words extracted successfully.");
             toast({
               title: 'File Loaded',
               description: `${file.name} is ready for reading.`,
             });
         }
      } catch (error: any) {
         console.error('Error during file processing or parsing:', error);
          // Dismiss loading toast first, then show error
          if (loadingToastId && dismiss) dismiss(loadingToastId);
          toast({
           title: 'Error Loading File',
           description: error.message || 'An unexpected error occurred. Check console.',
           variant: 'destructive',
            duration: 7000, // Longer duration for errors
         });
         setFileName(null);
         setText('');
         setWords([]);
      } finally {
        console.log("File upload handling finished.");
        if (event.target) {
            event.target.value = ''; // Reset input for re-upload
        }
      }
    },
    [parseEpub, toast, dismiss] // Removed extractTextRecursive as it's memoized and stable
  );


  // Function to find the next punctuation mark or end of text
  const findNextPunctuation = useCallback((startIndex: number): number => {
    for (let i = startIndex; i < words.length; i++) {
      // Match common sentence terminators or clause separators
      if (words[i] && /[.,!?;:]$/.test(words[i])) {
        return i; // Return index of the word *with* punctuation
      }
    }
    return -1; // Return -1 if no punctuation found before the end
  }, [words]);


   // Memoize the calculation of chunk size and delay multiplier
   const currentChunkAndDelay = useMemo((): { chunkSize: number; delayMultiplier: number; isAdjusted: boolean } => {
     let chunkSize = Math.max(1, wordsPerDisplay); // Start with user setting
     let delayMultiplier = 1.0; // Base multiplier
     let localIsAdjustingChunk = false; // Use local variable to avoid direct state update

     // Check the *last word of the previous chunk* for punctuation pause
     if (currentIndex > 0) {
       const lastWordOfPreviousChunkIndex = currentIndex - 1;
       if (lastWordOfPreviousChunkIndex >= 0 && lastWordOfPreviousChunkIndex < words.length) {
          const previousWord = words[lastWordOfPreviousChunkIndex];
          if (previousWord && /[.?!]$/.test(previousWord)) {
              // console.log(`Sentence end detected before index ${currentIndex}: "${previousWord}". Doubling delay.`);
              delayMultiplier = 2.0; // Double delay for sentence terminators
          }
          else if (previousWord && /[,;:]$/.test(previousWord)) {
              // console.log(`Clause punctuation detected before index ${currentIndex}: "${previousWord}". Adding 50% delay.`);
              delayMultiplier = 1.5; // 50% longer delay for commas, semicolons, colons
          }
       }
     }

     // --- Adaptive Chunk Size Logic ---
     const nextPunctuationIndex = findNextPunctuation(currentIndex);

     if (nextPunctuationIndex !== -1) {
         const wordsUntilPunctuation = nextPunctuationIndex - currentIndex + 1;
         // Condition: If words until punctuation is at least double the user setting
         if (wordsUntilPunctuation >= wordsPerDisplay * 2) {
             // console.log(`Punctuation far (${wordsUntilPunctuation} words). Increasing chunk size.`);
             localIsAdjustingChunk = true;
             chunkSize = Math.min(10, wordsUntilPunctuation, Math.max(wordsPerDisplay, Math.floor(wordsPerDisplay * 1.5)));
             // Reset multiplier if chunk size is increased? Let's test keeping the multiplier based on previous word.
             // delayMultiplier = 1.0;
         } else {
             // console.log(`Punctuation near (${wordsUntilPunctuation} words). Using standard chunk size.`);
             chunkSize = wordsPerDisplay;
         }
     } else {
         // console.log("No punctuation ahead. Using standard chunk size.");
         chunkSize = wordsPerDisplay;
     }

     return { chunkSize: Math.max(1, chunkSize), delayMultiplier, isAdjusted: localIsAdjustingChunk };

   }, [wordsPerDisplay, currentIndex, findNextPunctuation, words]); // Recalculate when these change


   // Effect to update the isAdjustingChunk state based on the memoized calculation
   useEffect(() => {
     setIsAdjustingChunk(currentChunkAndDelay.isAdjusted);
   }, [currentChunkAndDelay.isAdjusted]);


  // Function to advance to the next word/chunk
  const advanceWord = useCallback(() => {
    // Get chunk size from the memoized calculation
    const { chunkSize } = currentChunkAndDelay;
    const nextIndex = currentIndex + chunkSize;

    if (nextIndex >= words.length) {
        setCurrentIndex(words.length); // Go to the very end
        setIsPlaying(false);
        toast({ title: "End of Text", description: "Finished reading." });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
        setCurrentIndex(nextIndex); // Move to the start of the next chunk
    }
  }, [currentIndex, words.length, currentChunkAndDelay, toast]); // Depend on memoized value


   // Effect to handle the reading timer using setTimeout for dynamic delays
   useEffect(() => {
     if (timeoutRef.current) {
       clearTimeout(timeoutRef.current);
       timeoutRef.current = null;
     }

     if (isPlaying && words.length > 0 && currentIndex < words.length) {
        // Get chunk size and delay multiplier from the memoized calculation
        const { chunkSize, delayMultiplier } = currentChunkAndDelay;

        // Calculate base interval using user WPM and *base* wordsPerDisplay
        const baseInterval = calculateBaseInterval();

        // Adjust interval based on the *actual* chunk size being displayed *and* the punctuation multiplier
        const sizeMultiplier = chunkSize / Math.max(1, wordsPerDisplay);
        let currentDelay = baseInterval * sizeMultiplier * delayMultiplier;

       // Schedule the next advanceWord call
       console.log(`Scheduling next word. Chunk Size: ${chunkSize}, Base Interval: ${baseInterval.toFixed(0)}ms, Size Multiplier: ${sizeMultiplier.toFixed(2)}, Punctuation Multiplier: ${delayMultiplier.toFixed(2)}, Final Delay: ${currentDelay.toFixed(0)}ms`);
       timeoutRef.current = setTimeout(advanceWord, Math.max(50, currentDelay)); // Ensure minimum delay
     }

     // Cleanup function
     return () => {
       if (timeoutRef.current) {
         clearTimeout(timeoutRef.current);
         timeoutRef.current = null; // Ensure ref is cleared on cleanup
       }
     };
   }, [
       isPlaying,
       words, // Depends on words array content
       currentIndex,
       advanceWord, // This is memoized and stable
       calculateBaseInterval, // This is memoized and stable based on wpm/wordsPerDisplay
       currentChunkAndDelay, // Depend on memoized value
       wordsPerDisplay // Base interval depends on this
     ]);


   useEffect(() => {
    if (words.length > 0) {
      const currentPosition = Math.min(currentIndex, words.length);
      const currentProgress = (currentPosition / words.length) * 100;
       setProgress(Math.min(100, Math.max(0, currentProgress)));
    } else {
      setProgress(0);
    }
   }, [currentIndex, words.length]);


  const togglePlay = () => {
    if (words.length === 0) {
      toast({
        title: 'No Text Loaded',
        description: 'Please upload a file.',
        variant: 'destructive',
      });
      return;
    }
     if (currentIndex >= words.length) { // If at the end
        setCurrentIndex(0);
        setProgress(0);
        setIsPlaying(true); // Start from beginning
        toast({title: "Restarting Reading"});
    } else {
         setIsPlaying((prev) => {
             const newState = !prev;
             // If changing to paused state, clear any pending timeout
             if (!newState && timeoutRef.current) {
                 clearTimeout(timeoutRef.current);
                 timeoutRef.current = null;
             }
             // The useEffect will handle starting/resuming the timer if newState is true
             return newState;
         });
    }
  };

  // Get the current chunk size from the memoized calculation
  const { chunkSize: currentChunkSizeForDisplay } = currentChunkAndDelay;
  const currentWords = words.slice(currentIndex, currentIndex + currentChunkSizeForDisplay);

   const calculatePivot = (word: string): number => {
    if (!word) return 0;
     // Remove trailing punctuation before calculating pivot
     const cleanWord = word.replace(/[.,!?;:]+$/, '');
     // Ensure length is at least 1 after cleaning
     const len = Math.max(1, cleanWord.length);
     // Pivot calculation: roughly 1/3rd of the way in, min 0, max len-1
     return Math.max(0, Math.min(Math.floor(len / 3), len - 1));
   };

  // Calculate pivot based *only* on the first word of the current chunk
  const firstWordPivotIndex = calculatePivot(currentWords[0] || '');


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Progress value={progress} className="w-full h-1 fixed top-0 left-0 z-20" />
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-5 pb-20 px-4">
        {words.length > 0 ? (
          <ReadingDisplay
            words={currentWords}
            pivotIndex={firstWordPivotIndex} // Pass the calculated pivot for the first word
            isAdjusted={isAdjustingChunk} // Pass indicator for visual feedback
           />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Upload a .txt or .epub file to begin.</p>
            {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
             {/* <p className="text-xs mt-4">(Check console for loading errors)</p> */}
          </div>
        )}
      </main>
      <ReaderControls
        wpm={wpm}
        setWpm={setWpm}
        wordsPerDisplay={wordsPerDisplay}
        setWordsPerDisplay={setWordsPerDisplay}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        onFileUpload={handleFileUpload}
        fileName={fileName}
      />
    </div>
  );
}
// Potential Future Enhancements:
// - Navigation (jump back/forward, go to percentage)
// - More sophisticated punctuation handling (e.g., abbreviations vs. sentence ends)
// - Remember reading position across sessions (localStorage)
// - Theme switching (light/dark)
// - Font customization
// - Support for more file types (PDF, DOCX - might require server-side processing or heavier libraries)

