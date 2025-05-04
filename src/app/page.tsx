
'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
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


export default function Home() {
  const [text, setText] = useState<string>('');
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [wpm, setWpm] = useState<number>(300);
  const [wordsPerDisplay, setWordsPerDisplay] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // Ref for managing setTimeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Function to calculate base interval delay
  const calculateBaseInterval = useCallback(() => {
    const effectiveWpm = Math.max(1, wpm);
    // Calculate delay per word, then multiply by words per display
    return (60 / effectiveWpm) * 1000 * Math.max(1, wordsPerDisplay);
  }, [wpm, wordsPerDisplay]);


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
          book = Epub(e.target.result as ArrayBuffer); // Assign to the outer scope variable

          // Listen for book:error event which might indicate DRM or corruption early
          book.on('book:error', (err: any) => {
            // Log book-level errors more visibly
            console.error('EPUB Book Error Event:', err);
            console.error('EPUB Book Error Name:', err?.name);
            console.error('EPUB Book Error Message:', err?.message);
            console.error('EPUB Book Error Stack:', err?.stack);
            // Don't reject here yet, let the parsing proceed to see if we can get partial content or a more specific error
          });

          console.log("EPUB instance created, awaiting book.ready...");
          await book.ready; // Wait for the book metadata to load
          console.log("book.ready resolved. Processing spine items...");

           // Process all sections sequentially to ensure order
          let fullText = '';
          let sectionErrors = 0;
          for (const item of book.spine.items) {
            try {
                console.log(`Loading section ${item.idref || 'unknown'}...`);
                // Increased timeout for loading sections, default might be too short for complex ones
                const section = await item.load(book.load.bind(book)).catch(loadError => {
                    console.warn(`Error during item.load for section ${item.idref || 'unknown'}:`, loadError);
                    throw new Error(`Failed to load section ${item.idref || 'unknown'}`); // Re-throw to be caught by outer catch
                });
                console.log(`Section ${item.idref || 'unknown'} loaded successfully. Type: ${typeof section}`);

                // Ensure section content is available and is likely HTML (basic check)
                 if (section && typeof (section as any).querySelector === 'function') { // Check if it behaves like a Document/Element
                    const body = (section as Document).body; // Assuming section is like a Document
                    if (body) {
                        console.log(`Extracting text from body of section ${item.idref || 'unknown'}.`);
                        // Function to recursively extract text, adding line breaks for block elements
                        const extractTextWithBreaks = (node: Node): string => {
                            let extractedText = '';
                            if (node.nodeType === Node.TEXT_NODE) {
                                // Append trimmed text node content, ensuring single space separation
                                const trimmedText = node.textContent?.trim();
                                if (trimmedText) {
                                    // Add space only if the last char wasn't already a space or newline
                                    if (extractedText.length > 0 && !/[\s\n]$/.test(extractedText) && !extractedText.endsWith('\n\n')) {
                                         extractedText += ' ';
                                    }
                                    extractedText += trimmedText;
                                }
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                const element = node as HTMLElement;
                                // Consider common block-level elements for paragraph breaks
                                const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'BR'].includes(element.tagName.toUpperCase());

                                if (isBlock && extractedText.length > 0 && !extractedText.endsWith('\n\n') && !extractedText.endsWith(' ')) {
                                    // Add paragraph break before block elements if needed, unless already spaced
                                     extractedText += '\n\n';
                                } else if (isBlock && extractedText.length > 0 && !extractedText.endsWith('\n\n') ) {
                                     // Add single newline if already ends with a space (less aggressive break)
                                     extractedText += '\n';
                                }


                                for (let i = 0; i < node.childNodes.length; i++) {
                                    extractedText += extractTextWithBreaks(node.childNodes[i]);
                                }

                                 if (isBlock && !extractedText.endsWith('\n\n')) {
                                     // Add paragraph break after block elements if needed
                                     extractedText += '\n\n';
                                 }
                            }
                            return extractedText;
                        };
                         fullText += extractTextWithBreaks(body);
                         // Add a space after processing a body to separate sections, unless it already ends with space/newline
                         if (!/[\s\n]$/.test(fullText)) {
                             fullText += ' ';
                         }
                    } else {
                         console.warn(`Section ${item.idref || 'unknown'} loaded but body element not found.`);
                         // Fallback: try getting text content from the whole section document
                         const sectionText = (section as Document).documentElement?.textContent?.trim();
                         if(sectionText) {
                             console.log(`Falling back to documentElement.textContent for section ${item.idref || 'unknown'}.`);
                             fullText += sectionText + '\n\n';
                         } else {
                             console.warn(`Fallback failed for section ${item.idref || 'unknown'}. No text extracted.`);
                             sectionErrors++;
                         }
                    }
                } else if (typeof section === 'string'){
                     // If section is just a string (less common but possible), try basic parsing
                     console.warn(`Section ${item.idref || 'unknown'} loaded as a string.`);
                     // Basic attempt to treat as HTML, might not be robust
                     const tempDiv = document.createElement('div');
                     tempDiv.innerHTML = section; // SECURITY NOTE: Be cautious with innerHTML if content isn't trusted
                     const stringSectionText = tempDiv.textContent?.trim();
                     if(stringSectionText) {
                        console.log(`Extracted text from string-based section ${item.idref || 'unknown'}.`);
                        fullText += stringSectionText + '\n\n';
                     } else {
                        console.warn(`Failed to extract text from string-based section ${item.idref || 'unknown'}.`);
                        sectionErrors++;
                     }
                } else {
                    console.warn(`Skipping section ${item.idref || 'unknown'} with unexpected content type:`, typeof section, section);
                    sectionErrors++;
                }
            } catch (sectionError: any) { // Catch errors specific to section processing
                console.error(`Detailed error processing section ${item.idref || 'unknown'}:`, sectionError);
                console.error("Section Error Name:", sectionError?.name);
                console.error("Section Error Message:", sectionError?.message);
                console.error("Section Error Stack:", sectionError?.stack);
                sectionErrors++;
                // Optionally add a marker for skipped sections
                 //fullText += "\n\n[Section Skipped Due To Error]\n\n";
                 // Reject the promise if a section fails, potentially indicating a larger issue
                 reject(new Error(`Error processing EPUB section ${item.idref || 'unknown'}: ${sectionError.message || 'Unknown section error'}`));
                 return; // Exit the loop and promise handling on the first critical section error
            }
          }
          console.log(`Finished processing ${book.spine.items.length} sections with ${sectionErrors} errors.`);

           // Clean up excessive whitespace and line breaks more carefully
           fullText = fullText.replace(/[ \t]{2,}/g, ' '); // Consolidate multiple spaces/tabs to single space
           fullText = fullText.replace(/(\r\n|\r|\n)[ \t]*(\r\n|\r|\n)/g, '\n\n'); // Consolidate multiple newlines (with optional space in between) to max 2
           fullText = fullText.replace(/(\n\n){2,}/g, '\n\n'); // Ensure max 2 consecutive newlines
           fullText = fullText.trim(); // Trim leading/trailing whitespace
           console.log(`Extracted text length (after cleanup): ${fullText.length}`);

           if (fullText.length === 0 && sectionErrors === book.spine.items.length && book.spine.items.length > 0) {
               // If all sections failed and resulted in no text, and there were sections to process
                console.error("All sections failed to process. No text extracted.");
               throw new Error("Failed to extract any text content from the EPUB sections. The file might be empty, heavily formatted, corrupted, or protected.");
           } else if (fullText.length === 0) {
               // If no text was extracted but not all sections failed (e.g., empty file or non-text content)
                console.warn("EPUB parsed but resulted in empty text content. The file might be empty or contain primarily non-textual content.");
                // Resolve with empty string, let the caller decide how to handle empty content
           } else if (sectionErrors > 0) {
               console.warn(`EPUB parsed with ${sectionErrors} section error(s). Extracted text might be incomplete.`);
               // Resolve with partial text, let the UI indicate potential issues
               toast({
                 title: 'Parsing Warning',
                 description: `EPUB parsed with ${sectionErrors} section error(s). Extracted text might be incomplete.`,
                 variant: 'destructive', // Use 'destructive' style for warnings too
               });
           }

           console.log("EPUB parsing and text extraction successful (or partially successful). Resolving promise.");
           resolve(fullText);

        } catch (error: any) { // Catch errors during initial book loading or overall process
            // LOG THE DETAILED ERROR OBJECT
            console.error("Detailed EPUB Parsing Error:", error);
            console.error("Error Name:", error?.name);
            console.error("Error Message:", error?.message);
            console.error("Error Stack:", error?.stack);

            let errorMessage = "Error parsing EPUB file.";

            if (isLikelyDrmError(error)) {
                 errorMessage += " This file might be DRM-protected, which is not supported.";
            } else if (error.message) {
                 // Append specific error message if available and potentially helpful
                 // Be careful not to leak sensitive info if applicable
                 if (!error.message.includes("JSZip")) { // Avoid generic JSZip errors
                    errorMessage += ` Details: ${error.message}`;
                 } else {
                    errorMessage += " Possible structure error or corruption.";
                 }
            } else {
                 errorMessage += " It might be corrupted or in an unsupported format.";
            }
             // Reject with the constructed message, but the detailed log is key
            reject(new Error(errorMessage));
        } finally {
             // Clean up the book instance to free resources
             try {
                if (book && typeof book.destroy === 'function') {
                    console.log("Destroying epubjs book instance...");
                    book.destroy();
                    console.log("Book instance destroyed.");
                }
             } catch (destroyError) {
                console.warn("Error destroying epubjs book instance:", destroyError);
             }
        }
      };
      reader.onerror = (e) => {
        // Log the specific FileReader error event
        console.error("FileReader error event:", e);
        console.error("FileReader error details:", reader.error); // Access the error property
        reject(new Error(`Error reading the file using FileReader: ${reader.error?.message || 'Unknown FileReader error'}`));
      };
      reader.onabort = (e) => {
        console.warn("FileReader operation aborted:", e);
        reject(new Error("File reading was aborted."));
      }

      console.log(`Starting FileReader for ${file.name}...`);
      reader.readAsArrayBuffer(file); // Use readAsArrayBuffer for epubjs
    });
   }, [toast]);


  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
          console.log("No file selected.");
          return;
      }

       console.log(`File selected: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);

      setIsPlaying(false); // Stop reading when a new file is uploaded
      if (timeoutRef.current) clearTimeout(timeoutRef.current); // Clear any pending timeout
      setCurrentIndex(0); // Reset index
      setProgress(0); // Reset progress
      setFileName(file.name); // Set the file name
      setText(''); // Clear previous text immediately
      setWords([]); // Clear previous words immediately

      const loadingToastId = toast({ title: 'Loading File...', description: `Processing ${file.name}` }).id;

      try {
         let fileContent = '';
         console.log(`Checking file type for ${file.name}...`);
         if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
           console.log("Detected text file.");
           const reader = new FileReader();
           fileContent = await new Promise<string>((resolve, reject) => {
             reader.onload = (e) => {
                 if (e.target?.result) {
                     console.log("TXT file read successfully by FileReader.");
                     resolve(e.target.result as string);
                 } else {
                      console.error("FileReader onload for TXT, but result is empty.");
                     reject(new Error("Failed to read TXT file content (FileReader result was empty)."));
                 }
             };
             reader.onerror = (e) => {
                  console.error("FileReader error reading TXT:", reader.error);
                 reject(new Error(`Error reading TXT file: ${reader.error?.message || 'Unknown FileReader error'}`));
             };
             console.log("Reading TXT file as text...");
             reader.readAsText(file);
           });
         } else if (file.name.toLowerCase().endsWith('.epub')) {
             console.log("Detected EPUB file. Calling parseEpub...");
             fileContent = await parseEpub(file);
             console.log("parseEpub completed.");
         } else if (file.name.toLowerCase().endsWith('.mobi')) {
            console.warn("Unsupported file type: .mobi");
            toast({
             id: loadingToastId, // Use existing ID to update/dismiss
             title: 'Unsupported Format',
             description: '.mobi files are not currently supported. Please try .txt or .epub.',
             variant: 'destructive',
           });
           setFileName(null);
           return; // Exit early
         } else {
            console.warn(`Unsupported file type: ${file.type} / ${file.name}`);
           toast({
             id: loadingToastId, // Use existing ID to update/dismiss
             title: 'Unsupported File Type',
             description: `File type for "${file.name}" is not supported. Please upload a .txt or .epub file.`,
             variant: 'destructive',
           });
            setFileName(null);
           return; // Exit early
         }

         console.log(`File content length: ${fileContent.length}`);
         setText(fileContent);
         // More robust word splitting, handling punctuation attached to words
         const newWords = fileContent.match(/[\w'-]+(?:[.,!?;:]?)|[.,!?;:]/g) || [];
         // const newWords = fileContent.split(/[\s\n]+/).filter(Boolean); // Original splitting
         console.log(`Extracted ${newWords.length} words.`);
         setWords(newWords);

         // Dismiss loading toast explicitly by ID if it's still shown
         toast({id: loadingToastId, open: false });


         if (newWords.length === 0 && fileContent.length > 0) {
             console.warn("File loaded, but no words extracted. Content might be structured unusually.");
            toast({
             title: 'Parsing Issue',
             description: 'File loaded, but no words were extracted. The content might be empty, structured unusually, or contain only non-text elements.',
             variant: 'destructive', // Use destructive for potential issues
           });
         } else if (newWords.length === 0) {
              console.warn("The loaded file appears to be empty or contains no readable text.");
             toast({
             title: 'Empty File',
             description: 'The loaded file appears to be empty or contains no readable text.',
              variant: 'destructive', // Use destructive for empty/unreadable
           });
         } else {
             console.log("File loaded and words extracted successfully.");
             toast({
               title: 'File Loaded Successfully',
               description: `${file.name} is ready for reading.`,
             });
         }
      } catch (error: any) {
         // LOG THE ERROR FROM EITHER PARSER OR FILEREADER
         console.error('Detailed error during file processing or parsing:', error);
         console.error("Error Name:", error?.name);
         console.error("Error Message:", error?.message);
         console.error("Error Stack:", error?.stack);

         // Update or dismiss the loading toast with the error message
          toast({
           id: loadingToastId, // Use existing ID
           title: 'Error Loading File',
           // Use the specific error message caught
           description: error.message || 'An unexpected error occurred while loading or parsing the file. Check the console for details.',
           variant: 'destructive',
         });
         setFileName(null); // Reset filename on error
         // Ensure text/words are cleared (already done at the start, but good for safety)
         setText('');
         setWords([]);
      } finally {
        console.log("File upload handling finished.");
         // Reset the file input value so the same file can be uploaded again
        if (event.target) {
            console.log("Resetting file input value.");
            event.target.value = '';
        }
      }


    },
    [parseEpub, toast]
  );


   // Function to advance to the next word/chunk
   const advanceWord = useCallback(() => {
    if (currentIndex + wordsPerDisplay >= words.length) {
        // Reached the end
        setCurrentIndex(words.length); // Set index to the very end
        setIsPlaying(false);
        toast({ title: "End of Text Reached", description: "You've finished reading the loaded content." });
        if (timeoutRef.current) clearTimeout(timeoutRef.current); // Clear timeout at the end
    } else {
        // Move to the next chunk
        setCurrentIndex(prevIndex => prevIndex + wordsPerDisplay);
        // Note: The scheduling of the *next* advance happens in the useEffect
    }
  }, [currentIndex, words.length, wordsPerDisplay, toast]);


  // Effect to handle the reading timer using setTimeout for dynamic delays
  useEffect(() => {
    // Clear any existing timeout when dependencies change or play state toggles
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isPlaying && words.length > 0 && currentIndex < words.length) {
      const baseInterval = calculateBaseInterval();
      let currentDelay = baseInterval;

      // Check the last word of the *previous* chunk for punctuation (if applicable)
      // Or check the word *before* the current chunk starts
      if (currentIndex > 0) {
         const previousWord = words[currentIndex - 1];
         if (previousWord && /[.,!?;:]$/.test(previousWord)) {
           console.log(`Punctuation detected before chunk starting at index ${currentIndex}: "${previousWord}". Doubling delay.`);
           currentDelay *= 2; // Double delay for common punctuation
         }
      }
      // Alternative: Check the last word of the *current* chunk being displayed
      // This would pause *after* showing the punctuation. Choose one approach.
      /*
      const lastWordInCurrentChunkIndex = Math.min(currentIndex + wordsPerDisplay - 1, words.length - 1);
      const lastWordInCurrentChunk = words[lastWordInCurrentChunkIndex];
      if (lastWordInCurrentChunk && /[.,!?;:]$/.test(lastWordInCurrentChunk)) {
           console.log(`Punctuation detected at end of chunk (index ${lastWordInCurrentChunkIndex}): "${lastWordInCurrentChunk}". Doubling delay for next.`);
          currentDelay *= 2; // Double delay for the *next* interval
      }
      */


      // Schedule the next advanceWord call
      timeoutRef.current = setTimeout(advanceWord, currentDelay);
    }

    // Cleanup function to clear timeout on unmount or when isPlaying becomes false
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // Dependencies: isPlaying, words.length, currentIndex, advanceWord, calculateBaseInterval
    // `advanceWord` and `calculateBaseInterval` are memoized, so they only change when their own deps change.
  }, [isPlaying, words.length, currentIndex, advanceWord, calculateBaseInterval]);


   useEffect(() => {
    if (words.length > 0) {
      // Calculate progress based on the number of words *started* (currentIndex)
      const currentPosition = Math.min(currentIndex, words.length);
      const currentProgress = (currentPosition / words.length) * 100;
       setProgress(Math.min(100, Math.max(0, currentProgress))); // Clamp progress between 0 and 100
    } else {
      setProgress(0);
    }
   }, [currentIndex, words.length]);


  const togglePlay = () => {
    if (words.length === 0) {
      toast({
        title: 'No Text Loaded',
        description: 'Please upload a file to start reading.',
        variant: 'destructive',
      });
      return;
    }
    // If at the very end (index is equal to length), reset to beginning
     if (currentIndex >= words.length && words.length > 0) {
        setCurrentIndex(0);
        setProgress(0); // Reset progress visually as well
        setIsPlaying(true); // Start playing from beginning
        toast({title: "Restarting Reading", description: "Starting from the beginning."});
    } else {
         // Otherwise, just toggle play/pause
         setIsPlaying((prev) => !prev);
         // If pausing, clear the timeout immediately
         if (isPlaying && timeoutRef.current) {
             clearTimeout(timeoutRef.current);
             timeoutRef.current = null;
         }
    }
  };

  const currentWords = words.slice(currentIndex, currentIndex + wordsPerDisplay);

  // Calculate pivot character index (simple middle point for now)
  // Recalculate pivot based on the first word in the current chunk
   const calculatePivot = (word: string): number => {
    if (!word) return 0;
     // Remove trailing punctuation for pivot calculation if needed, but display it
     const cleanWord = word.replace(/[.,!?;:]$/, '');
    // Pivot point around 1/3rd from the start, min 0, max length-1
    return Math.max(0, Math.min(Math.floor(cleanWord.length / 3), cleanWord.length - 1));
   };
  const firstWordPivotIndex = calculatePivot(currentWords[0] || '');


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Progress bar remains fixed */}
      <Progress value={progress} className="w-full h-1 fixed top-0 left-0 z-20" />
      {/* Main content area with padding */}
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-5 pb-20 px-4">
        {words.length > 0 ? (
          <ReadingDisplay words={currentWords} pivotIndex={firstWordPivotIndex} />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Upload a .txt or .epub file to begin reading.</p>
            {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
            <p className="text-xs mt-4">(Check browser console for detailed loading errors)</p>
          </div>
        )}
      </main>
      {/* Controls remain fixed at the bottom */}
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
