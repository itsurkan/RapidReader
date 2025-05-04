
'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Book } from 'epubjs'; // Import epubjs types only
import { ReaderControls } from '@/components/reader-controls';
import { ReadingDisplay } from '@/components/reading-display';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
    return (60 / wpm) * 1000 * wordsPerDisplay;
  }, [wpm, wordsPerDisplay]);

  const parseEpub = useCallback(async (file: File): Promise<string> => {
    // Dynamically import epubjs only when needed to avoid making the component client-only unnecessarily at build time
    const Epub = (await import('epubjs')).default;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          return reject(new Error("Failed to read EPUB file"));
        }
        try {
          const book = new Epub(e.target.result as ArrayBuffer);
          await book.ready; // Wait for the book metadata to load

           // Process all sections sequentially to ensure order
          let fullText = '';
          for (const item of book.spine.items) {
            try {
                const section = await item.load(book.load.bind(book));
                // Ensure section content is available and is HTML
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
                                    extractedText += trimmedText + ' ';
                                }
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                const element = node as HTMLElement;
                                // Consider common block-level elements for paragraph breaks
                                const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR'].includes(element.tagName) || element.tagName === 'BR';

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
                        // Fallback for sections without a clear body, treat as plain text
                        fullText += (section as any).textContent?.trim() + '\n\n';
                    }
                } else if (typeof section === 'string'){
                     // If section is just a string (less common but possible), try basic parsing
                     const tempDiv = document.createElement('div');
                     tempDiv.innerHTML = section;
                     fullText += tempDiv.textContent?.trim() + '\n\n';
                } else {
                    console.warn("Skipping section with unexpected content type:", section);
                }
            } catch (sectionError) {
                console.warn(`Skipping section due to error: ${sectionError}`);
                // Optionally add a marker for skipped sections
                // fullText += "\n\n[Section Skipped Due To Error]\n\n";
            }
          }


           // Clean up excessive whitespace and line breaks
           fullText = fullText.replace(/(\n\n\s*){2,}/g, '\n\n'); // Consolidate multiple breaks
           fullText = fullText.replace(/ +/g, ' ').trim(); // Consolidate multiple spaces
           resolve(fullText);

        } catch (error: any) {
            console.error("Error parsing EPUB:", error);
            const specificError = error?.message ? `: ${error.message}` : '';
            reject(new Error(`Error parsing EPUB file. It might be corrupted, DRM-protected, or in an unsupported format${specificError}.`));
        }
      };
      reader.onerror = (e) => {
        console.error("FileReader error:", e);
        reject(new Error("Error reading file"));
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);


  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsPlaying(false); // Stop reading when a new file is uploaded
      setCurrentIndex(0); // Reset index
      setProgress(0); // Reset progress
      setFileName(file.name); // Set the file name

      try {
         let fileContent = '';
         if (file.type === 'text/plain') {
           const reader = new FileReader();
           fileContent = await new Promise<string>((resolve, reject) => {
             reader.onload = (e) => resolve(e.target?.result as string);
             reader.onerror = (e) => reject(new Error("Error reading TXT file"));
             reader.readAsText(file);
           });
         } else if (file.name.endsWith('.epub')) {
             fileContent = await parseEpub(file);
         } else if (file.name.endsWith('.mobi')) {
           toast({
             title: 'Unsupported Format',
             description: '.mobi files are not currently supported. Please try .txt or .epub.',
             variant: 'destructive',
           });
           setFileName(null);
           return; // Exit early
         } else {
           toast({
             title: 'Unsupported File Type',
             description: 'Please upload a .txt or .epub file.',
             variant: 'destructive',
           });
            setFileName(null);
           return; // Exit early
         }

         setText(fileContent);
         const newWords = fileContent.split(/\s+/).filter(Boolean); // Split by whitespace and remove empty strings
         setWords(newWords);
         if (newWords.length === 0 && fileContent.length > 0) {
            toast({
             title: 'Parsing Issue',
             description: 'File loaded, but no words were extracted. The content might be empty or structured unusually.',
             variant: 'destructive',
           });
         } else if (newWords.length === 0) {
             toast({
             title: 'Empty File',
             description: 'The loaded file appears to be empty.',
             variant: 'destructive',
           });
         } else {
             toast({
               title: 'File Loaded',
               description: `${file.name} loaded successfully.`,
             });
         }
      } catch (error: any) {
         console.error('Error processing file:', error);
         toast({
           title: 'Error Loading File',
           description: error.message || 'Could not load or parse the file.',
           variant: 'destructive',
         });
         setFileName(null); // Reset filename on error
         setText('');
         setWords([]);
      } finally {
         // Reset the file input value so the same file can be uploaded again
        if (event.target) {
            event.target.value = '';
        }
      }


    },
    [toast, parseEpub]
  );


   const advanceWord = useCallback(() => {
    setCurrentIndex((prevIndex) => {
      const nextIndex = prevIndex + wordsPerDisplay;
      if (nextIndex >= words.length) {
        setIsPlaying(false); // Stop at the end
         // Stay on the last chunk if possible, otherwise reset/stop
         return words.length > wordsPerDisplay ? words.length - wordsPerDisplay : 0;
      }
      return nextIndex;
    });
  }, [words.length, wordsPerDisplay]);


  useEffect(() => {
    if (isPlaying && words.length > 0) {
      // Ensure we don't restart interval if already at the end
      if (currentIndex + wordsPerDisplay < words.length) {
        intervalRef.current = setInterval(advanceWord, calculateInterval());
      } else {
          setIsPlaying(false); // Auto-stop if somehow play is toggled at the very end
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
  }, [isPlaying, words.length, calculateInterval, advanceWord, currentIndex, wordsPerDisplay]); // Added currentIndex and wordsPerDisplay


   useEffect(() => {
    if (words.length > 0) {
      // Calculate progress based on the start of the *next* chunk to be displayed
      const currentPosition = Math.min(currentIndex + wordsPerDisplay, words.length);
      const currentProgress = (currentPosition / words.length) * 100;
      setProgress(Math.min(100, Math.max(0, currentProgress))); // Clamp progress between 0 and 100
    } else {
      setProgress(0);
    }
   }, [currentIndex, words.length, wordsPerDisplay]);


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
    if (currentIndex + wordsPerDisplay >= words.length) {
        if (words.length > 0) { // Prevent reset if there are no words
            setCurrentIndex(0);
            setProgress(0); // Reset progress visually as well
            setIsPlaying(true); // Start playing from beginning
        } else {
             setIsPlaying(false); // Should not happen if check above works, but safety first
        }

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
      <Progress value={progress} className="w-full h-1 absolute top-0 left-0 z-10" />
      <main className="flex-grow flex items-center justify-center overflow-hidden pt-1 pb-20"> {/* Added padding bottom for controls */}
        {words.length > 0 ? (
          <ReadingDisplay words={currentWords} pivotIndex={pivotIndex} />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Upload a .txt or .epub file to begin reading.</p>
             {fileName && <p className="text-sm mt-2">Attempted to load: {fileName}</p>}
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

