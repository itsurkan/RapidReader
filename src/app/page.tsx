
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const calculateInterval = useCallback(() => {
    // Ensure wpm is positive to avoid division by zero or negative intervals
    const effectiveWpm = Math.max(1, wpm);
    return (60 / effectiveWpm) * 1000 * Math.max(1, wordsPerDisplay);
  }, [wpm, wordsPerDisplay]);

  const parseEpub = useCallback(async (file: File): Promise<string> => {
    // Dynamically import epubjs only when needed
    const Epub = (await import('epubjs')).default;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          return reject(new Error("Failed to read EPUB file content."));
        }
        try {
          const book = new Epub(e.target.result as ArrayBuffer);

          // Listen for book:error event which might indicate DRM or corruption early
          book.on('book:error', (err: any) => {
            console.error('EPUB Book Error Event:', err);
            // Don't reject here yet, let the parsing proceed to see if we can get partial content or a more specific error
          });


          await book.ready; // Wait for the book metadata to load

           // Process all sections sequentially to ensure order
          let fullText = '';
          let sectionErrors = 0;
          for (const item of book.spine.items) {
            try {
                // Increased timeout for loading sections, default might be too short for complex ones
                const section = await item.load(book.load.bind(book)).catch(loadError => {
                    console.warn(`Error loading section ${item.idref || 'unknown'}:`, loadError);
                    throw new Error(`Failed to load section ${item.idref || 'unknown'}`); // Re-throw to be caught by outer catch
                });

                // Ensure section content is available and is likely HTML (basic check)
                 if (section && typeof (section as any).querySelector === 'function') { // Check if it behaves like a Document/Element
                    const body = (section as Document).body; // Assuming section is like a Document
                    if (body) {
                        // Function to recursively extract text, adding line breaks for block elements
                        const extractTextWithBreaks = (node: Node): string => {
                            let extractedText = '';
                            if (node.nodeType === Node.TEXT_NODE) {
                                // Append trimmed text node content, ensuring single space separation
                                const trimmedText = node.textContent?.trim();
                                if (trimmedText) {
                                    // Add space only if the last char wasn't already a space or newline
                                    if (extractedText.length > 0 && !/[\s\n]$/.test(extractedText)) {
                                         extractedText += ' ';
                                    }
                                    extractedText += trimmedText;
                                }
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                const element = node as HTMLElement;
                                // Consider common block-level elements for paragraph breaks
                                const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'BR'].includes(element.tagName);
                                const isInline = ['A', 'SPAN', 'I', 'B', 'EM', 'STRONG'].includes(element.tagName);

                                if (isBlock && extractedText.length > 0 && !extractedText.endsWith('\n\n')) {
                                     extractedText += '\n\n'; // Add paragraph break before block elements if needed
                                }

                                for (let i = 0; i < node.childNodes.length; i++) {
                                    extractedText += extractTextWithBreaks(node.childNodes[i]);
                                }

                                 if (isBlock && !extractedText.endsWith('\n\n')) {
                                     extractedText += '\n\n'; // Add paragraph break after block elements if needed
                                 }
                            }
                            return extractedText;
                        };
                         fullText += extractTextWithBreaks(body);
                    } else {
                         console.warn(`Section ${item.idref || 'unknown'} loaded but body element not found.`);
                         // Fallback: try getting text content from the whole section document
                         const sectionText = (section as Document).documentElement?.textContent?.trim();
                         if(sectionText) {
                             fullText += sectionText + '\n\n';
                         } else {
                             sectionErrors++;
                         }
                    }
                } else if (typeof section === 'string'){
                     // If section is just a string (less common but possible), try basic parsing
                     console.warn(`Section ${item.idref || 'unknown'} loaded as a string.`);
                     const tempDiv = document.createElement('div');
                     tempDiv.innerHTML = section;
                     const stringSectionText = tempDiv.textContent?.trim();
                     if(stringSectionText) {
                        fullText += stringSectionText + '\n\n';
                     } else {
                        sectionErrors++;
                     }
                } else {
                    console.warn(`Skipping section ${item.idref || 'unknown'} with unexpected content type:`, typeof section);
                    sectionErrors++;
                }
            } catch (sectionError) {
                console.error(`Error processing section ${item.idref || 'unknown'}:`, sectionError);
                sectionErrors++;
                // Optionally add a marker for skipped sections
                // fullText += "\n\n[Section Skipped Due To Error]\n\n";
            }
          }


           // Clean up excessive whitespace and line breaks
           fullText = fullText.replace(/(\r\n|\r|\n){3,}/g, '\n\n'); // Consolidate multiple newlines to max 2
           fullText = fullText.replace(/[ \t]{2,}/g, ' '); // Consolidate multiple spaces/tabs to single space
           fullText = fullText.trim(); // Trim leading/trailing whitespace


           if (fullText.length === 0 && sectionErrors === book.spine.items.length) {
               // If all sections failed and resulted in no text
               throw new Error("Failed to extract any text content from the EPUB sections. The file might be empty, heavily formatted, or protected.");
           } else if (fullText.length === 0) {
               // If no text was extracted but not all sections failed (e.g., empty file)
                console.warn("EPUB parsed but resulted in empty text content.");
                // Resolve with empty string, let the caller decide how to handle empty content
           } else if (sectionErrors > 0) {
               console.warn(`EPUB parsed with ${sectionErrors} section error(s). Extracted text might be incomplete.`);
               // Resolve with partial text, caller might want to know via toast
           }

           resolve(fullText);

        } catch (error: any) {
            console.error("Error parsing EPUB:", error);
            let errorMessage = "Error parsing EPUB file.";

            if (isLikelyDrmError(error)) {
                 errorMessage += " This file might be DRM-protected, which is not supported.";
            } else if (error.message) {
                 // Append specific error message if available and potentially helpful
                 errorMessage += ` Details: ${error.message}`;
            } else {
                 errorMessage += " It might be corrupted or in an unsupported format.";
            }
            reject(new Error(errorMessage));
        } finally {
             // Clean up the book instance to free resources
             try {
                if (book && typeof book.destroy === 'function') {
                    book.destroy();
                }
             } catch (destroyError) {
                console.warn("Error destroying epubjs book instance:", destroyError);
             }
        }
      };
      reader.onerror = (e) => {
        console.error("FileReader error:", e);
        reject(new Error("Error reading the file using FileReader."));
      };
      reader.readAsArrayBuffer(file);
    });
  }, []); // Removed toast from dependencies as it's stable


  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsPlaying(false); // Stop reading when a new file is uploaded
      setCurrentIndex(0); // Reset index
      setProgress(0); // Reset progress
      setFileName(file.name); // Set the file name
      setText(''); // Clear previous text immediately
      setWords([]); // Clear previous words immediately

      const loadingToast = toast({ title: 'Loading File...', description: `Processing ${file.name}` });

      try {
         let fileContent = '';
         if (file.type === 'text/plain') {
           const reader = new FileReader();
           fileContent = await new Promise<string>((resolve, reject) => {
             reader.onload = (e) => resolve(e.target?.result as string);
             reader.onerror = (e) => reject(new Error("Error reading TXT file with FileReader."));
             reader.readAsText(file);
           });
         } else if (file.name.endsWith('.epub')) {
             fileContent = await parseEpub(file);
         } else if (file.name.endsWith('.mobi')) {
           loadingToast.dismiss(); // Dismiss loading toast
           toast({
             title: 'Unsupported Format',
             description: '.mobi files are not currently supported. Please try .txt or .epub.',
             variant: 'destructive',
           });
           setFileName(null);
           return; // Exit early
         } else {
            loadingToast.dismiss(); // Dismiss loading toast
           toast({
             title: 'Unsupported File Type',
             description: `File type for "${file.name}" is not supported. Please upload a .txt or .epub file.`,
             variant: 'destructive',
           });
            setFileName(null);
           return; // Exit early
         }

         setText(fileContent);
         const newWords = fileContent.split(/[\s\n]+/).filter(Boolean); // Split by whitespace/newlines and remove empty strings
         setWords(newWords);

         loadingToast.dismiss(); // Dismiss loading toast

         if (newWords.length === 0 && fileContent.length > 0) {
            toast({
             title: 'Parsing Issue',
             description: 'File loaded, but no words were extracted. The content might be empty, structured unusually, or contain only non-text elements.',
             variant: 'destructive', // Use destructive for potential issues
           });
         } else if (newWords.length === 0) {
             toast({
             title: 'Empty File',
             description: 'The loaded file appears to be empty or contains no readable text.',
              variant: 'destructive', // Use destructive for empty/unreadable
           });
         } else {
             toast({
               title: 'File Loaded Successfully',
               description: `${file.name} is ready for reading.`,
             });
         }
      } catch (error: any) {
         console.error('Error processing file:', error);
          loadingToast.dismiss(); // Dismiss loading toast
         toast({
           title: 'Error Loading File',
           // Use the specific error message from parseEpub or FileReader
           description: error.message || 'An unexpected error occurred while loading or parsing the file.',
           variant: 'destructive',
         });
         setFileName(null); // Reset filename on error
         // Ensure text/words are cleared (already done at the start, but good for safety)
         setText('');
         setWords([]);
      } finally {
         // Reset the file input value so the same file can be uploaded again
        if (event.target) {
            event.target.value = '';
        }
      }


    },
    [parseEpub, toast] // Keep toast here as it's used directly
  );


   const advanceWord = useCallback(() => {
    setCurrentIndex((prevIndex) => {
      const nextIndex = prevIndex + wordsPerDisplay;
      if (nextIndex >= words.length) {
        setIsPlaying(false); // Stop at the end
         toast({ title: "End of Text Reached", description: "You've finished reading the loaded content." });
         // Ensure index doesn't go beyond possible slice start
          return Math.max(0, words.length - wordsPerDisplay); // Stay on the last valid chunk start
      }
      return nextIndex;
    });
  }, [words.length, wordsPerDisplay, toast]); // Added toast dependency


  useEffect(() => {
    if (isPlaying && words.length > 0) {
      // Ensure we don't restart interval if already at the end or beyond
       if (currentIndex < words.length) {
        intervalRef.current = setInterval(advanceWord, calculateInterval());
      } else {
           // If currentIndex is somehow already at or past the end, ensure we stop.
          setIsPlaying(false);
          if(intervalRef.current) clearInterval(intervalRef.current);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup interval on component unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
     // Add currentIndex and wordsPerDisplay to dependencies as they affect the condition and advanceWord logic.
  }, [isPlaying, words.length, calculateInterval, advanceWord, currentIndex, wordsPerDisplay]);


   useEffect(() => {
    if (words.length > 0) {
      // Calculate progress based on the number of words *started* (currentIndex)
      // This feels more intuitive than tracking based on the *next* chunk.
      const currentPosition = Math.min(currentIndex, words.length);
      const currentProgress = (currentPosition / words.length) * 100;
       setProgress(Math.min(100, Math.max(0, currentProgress))); // Clamp progress between 0 and 100
    } else {
      setProgress(0);
    }
   }, [currentIndex, words.length]); // Only depends on currentIndex and words.length


  const togglePlay = () => {
    if (words.length === 0) {
      toast({
        title: 'No Text Loaded',
        description: 'Please upload a file to start reading.',
        variant: 'destructive',
      });
      return;
    }
    // If at the end, reset to beginning before playing
     if (currentIndex >= words.length - wordsPerDisplay && currentIndex > 0) { // Check if truly at the end or last chunk
        setCurrentIndex(0);
        setProgress(0); // Reset progress visually as well
        setIsPlaying(true); // Start playing from beginning
        toast({title: "Restarting Reading", description: "Starting from the beginning."});
    } else {
         setIsPlaying((prev) => !prev);
    }
  };

  const currentWords = words.slice(currentIndex, currentIndex + wordsPerDisplay);

  // Calculate pivot character index (simple middle point for now)
  // A more sophisticated approach (ORP - Optimal Recognition Point) could be implemented here.
  const pivotIndex = currentWords.length > 0 ? Math.floor(currentWords[0].length / 3) : 0;


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
       {/* Use fixed positioning for progress bar to ensure it's always visible */}
      <Progress value={progress} className="w-full h-1 fixed top-0 left-0 z-20" />
       {/* Main content area with padding to avoid overlap with fixed progress and controls */}
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-5 pb-20 px-4"> {/* Adjusted padding */}
        {words.length > 0 ? (
          <ReadingDisplay words={currentWords} pivotIndex={pivotIndex} />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Upload a .txt or .epub file to begin reading.</p>
             {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
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
        // Pass functions to control reading position if needed in future
        // e.g., onSeek={handleSeek} onRewind={handleRewind}
      />
    </div>
  );
}

// Potential future additions:
// - handleSeek: Function to jump to a specific progress percentage
// - handleRewind: Function to go back a certain number of words/chunks
// - Settings persistence (localStorage)
// - More sophisticated ORP calculation
// - Theme switching (light/dark) based on system or user preference
// - Keyboard shortcuts for play/pause, speed adjustment etc.

