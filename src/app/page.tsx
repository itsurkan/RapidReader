'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Book, Section } from 'epubjs'; // Import epubjs types
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
          return reject(new Error("Failed to read EPUB file"));
        }
        try {
          const book = new Book(e.target.result as ArrayBuffer);
          await book.ready; // Wait for the book metadata to load
          const allSections = await Promise.all(
            book.spine.items.map(item => item.load(book.load.bind(book)))
          );

          let fullText = '';
          for (const sectionContent of allSections) {
            // Create a temporary div to parse HTML content
            const tempDiv = document.createElement('div');
            // Make sure sectionContent is a string before assigning
            if (typeof sectionContent === 'string') {
                 tempDiv.innerHTML = sectionContent;
                 // Extract text content, attempting to preserve paragraph structure somewhat
                 const paragraphs = tempDiv.querySelectorAll('p');
                 if (paragraphs.length > 0) {
                    paragraphs.forEach(p => {
                        fullText += p.textContent?.trim() + '\n\n'; // Add double newline for paragraph breaks
                    });
                 } else {
                     // Fallback if no <p> tags are found
                     fullText += tempDiv.textContent?.trim() + '\n\n';
                 }

            } else {
                 console.warn("Skipping non-string section content:", sectionContent);
            }

          }

           // Clean up excessive whitespace
           fullText = fullText.replace(/\s+/g, ' ').trim();
           resolve(fullText);

        } catch (error) {
          console.error("Error parsing EPUB:", error);
          reject(new Error("Error parsing EPUB file. It might be corrupted or in an unsupported format."));
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
             // Dynamically import epubjs only when needed
            const Epub = (await import('epubjs')).default;
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
         toast({
           title: 'File Loaded',
           description: `${file.name} loaded successfully.`,
         });
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
        return words.length > 0 ? words.length - wordsPerDisplay : 0; // Go to the last chunk
      }
      return nextIndex;
    });
  }, [words.length, wordsPerDisplay]);


  useEffect(() => {
    if (isPlaying && words.length > 0) {
      intervalRef.current = setInterval(advanceWord, calculateInterval());
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup interval on component unmount or when isPlaying/words/interval changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, words, calculateInterval, advanceWord]);

   useEffect(() => {
    if (words.length > 0) {
      const currentProgress = ((currentIndex + wordsPerDisplay) / words.length) * 100;
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
      setCurrentIndex(0);
    }
    setIsPlaying((prev) => !prev);
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
