
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isActualWord } from '@/lib/readingUtils'; // Import from readingUtils using alias
import { getPunctuationType } from '@/lib/punctuationUtils'; // Assuming this file exists and is correct
import { findChunkInfo } from '@/lib/chunkingLogic';
import { findPreviousChunkStart, findChunkStartForWordIndex } from '@/lib/chunkNavigation';
import { parseEpub } from '@/lib/epub/epubParser'; // Use alias path
import { calculatePivot } from '@/lib/pivotUtils'; // Import pivot calculation

interface ToastController {
  id: string;
  dismiss: () => void;
  update: (props: any) => void;
}

export function useReaderState() {
  const [text, setText] = useState<string>('');
  const [words, setWords] = useState<string[]>([]); // Holds all tokens
  const [actualWordCount, setActualWordCount] = useState<number>(0); // Count of actual words only
  const [currentIndex, setCurrentIndex] = useState<number>(0); // Token index
  const [wpm, setWpm] = useState<number>(1000); // Default WPM
  const [chunkWordTarget, setChunkWordTarget] = useState<number>(4); // Default chunk size
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isChunkSizeAdjusted, setIsChunkSizeAdjusted] = useState<boolean>(false); // Reflects if the *current* chunk used overflow logic

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastCtrlRef = useRef<ToastController | null>(null);
  const { toast, dismiss } = useToast(); // Use dismiss directly from hook

  // --- Core Reading Logic ---

  const calculateWordInterval = useCallback(() => {
    const effectiveWpm = Math.max(1, wpm);
    return (60 / effectiveWpm) * 1000;
  }, [wpm]);

  // Memoize the result of findChunkInfo for the current index
  const currentChunkInfo = useMemo(() =>
    findChunkInfo(currentIndex, chunkWordTarget, words),
    [currentIndex, chunkWordTarget, words]
  );

  // Determine delay multiplier based on punctuation *before* the current chunk
  const currentChunkPunctuationInfo = useMemo(() => {
    if (currentIndex <= 0 || currentIndex > words.length) return { delayMultiplier: 1.0 };
    // Check the punctuation type of the *last token of the previous chunk*
    const previousTokenIndex = currentIndex - 1;
    const previousToken = words[previousTokenIndex];
    const punctuationType = getPunctuationType(previousToken);

    if (punctuationType === 'sentence' || punctuationType === 'clause') {
      return { delayMultiplier: 2.0 }; // Paus multiplier
    }
    return { delayMultiplier: 1.0 };
  }, [currentIndex, words]);


  // Effect to update the adjustment state based on the memoized chunk info
  useEffect(() => {
    setIsChunkSizeAdjusted(currentChunkInfo.isAdjusted);
  }, [currentChunkInfo.isAdjusted]);


  const advanceChunk = useCallback(() => {
    const { endIndex } = currentChunkInfo; // Use memoized chunk info

    if (endIndex >= words.length) {
      setCurrentIndex(words.length);
      setIsPlaying(false);
      toast({ title: "End of Text", description: "Finished reading." });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      setCurrentIndex(endIndex);
    }
  }, [words.length, currentChunkInfo, toast]); // Depends on memoized info now


  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (isPlaying && words.length > 0 && currentIndex < words.length) {
      const { delayMultiplier } = currentChunkPunctuationInfo;
      const { actualWordsInChunk } = currentChunkInfo; // Use memoized info

      const wordInterval = calculateWordInterval();
      const effectiveWords = Math.max(1, actualWordsInChunk); // Use actual words in the *current* chunk
      const currentDelay = wordInterval * effectiveWords * delayMultiplier;

      timeoutRef.current = setTimeout(advanceChunk, Math.max(50, currentDelay)); // Use at least 50ms delay
    }

    // Cleanup function remains the same
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [
      isPlaying,
      words, // Need words.length
      currentIndex,
      advanceChunk,
      calculateWordInterval,
      currentChunkPunctuationInfo, // Depends on index, words
      currentChunkInfo // Depends on index, target, words
  ]);

  // --- Progress Update ---

  useEffect(() => {
    if (actualWordCount > 0 && words.length > 0) { // Added words.length check
      let wordsProcessed = 0;
      // Count words up to the *start* of the current chunk
      for (let i = 0; i < currentIndex; i++) {
        if (isActualWord(words[i])) {
          wordsProcessed++;
        }
      }
      // Calculate progress based on words processed so far
      const currentProgress = (wordsProcessed / actualWordCount) * 100;
      setProgress(Math.min(100, Math.max(0, currentProgress)));
    } else {
      setProgress(0);
    }
  }, [currentIndex, words, actualWordCount]);

  // --- File Handling ---

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

      // Use dismiss directly from useToast
       if (toastCtrlRef.current) {
         dismiss(toastCtrlRef.current.id);
         toastCtrlRef.current = null;
       }
       toastCtrlRef.current = toast({ title: 'Loading File...', description: `Processing ${file.name}` });
       const loadingToastId = toastCtrlRef.current?.id; // Store ID locally

      try {
        let fileContent = '';
        const lowerCaseName = file.name.toLowerCase();

        if (lowerCaseName.endsWith('.txt')) {
          console.log("Reading TXT file...");
          fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => e.target?.result ? resolve(e.target.result as string) : reject(new Error("Failed to read TXT."));
            reader.onerror = (e) => reject(new Error(`Error reading TXT: ${reader.error?.message || 'Unknown'}`));
            reader.readAsText(file);
          });
        } else if (lowerCaseName.endsWith('.epub')) {
          console.log("Parsing EPUB file...");
          fileContent = await parseEpub(file, toast, dismiss);
        } else if (lowerCaseName.endsWith('.mobi')) {
          // Explicitly reject .mobi files
          throw new Error(".mobi files are not supported due to technical limitations. Please use .txt or .epub.");
        } else {
          // Reject other unsupported types
          throw new Error(`Unsupported file type: "${file.name}". Please use .txt or .epub.`);
        }

        console.log(`File content length: ${fileContent.length}`);
        setText(fileContent);
        // Split by one or more whitespace or newline characters
        const newTokens = fileContent.split(/[\s\n]+/).filter(token => token.length > 0);
        console.log(`Extracted ${newTokens.length} tokens.`);
        setWords(newTokens);
        const wordCount = newTokens.filter(isActualWord).length;
        setActualWordCount(wordCount);
        console.log(`Counted ${wordCount} actual words.`);

         // Explicitly dismiss the loading toast *before* showing success/error
         if (loadingToastId) {
            dismiss(loadingToastId);
            // Ensure ref is cleared if this specific toast was dismissed
            if (toastCtrlRef.current?.id === loadingToastId) {
                 toastCtrlRef.current = null;
            }
         }


        if (newTokens.length === 0 && fileContent.length > 0) {
            throw new Error("File loaded, but no tokens extracted. Check content format.");
        } else if (newTokens.length === 0) {
            throw new Error("The file appears to be empty.");
        } else if (wordCount === 0) {
            throw new Error("The file contains no readable words (only punctuation/symbols?).");
        } else {
            toast({ title: 'File Loaded', description: `${file.name} is ready for reading.` });
        }
      } catch (error: any) {
        console.error('Error loading file:', error);
         // Ensure loading toast is dismissed on error too
         if (loadingToastId) {
            dismiss(loadingToastId);
            if (toastCtrlRef.current?.id === loadingToastId) {
                toastCtrlRef.current = null;
            }
         }
        toast({ title: 'Error Loading File', description: error.message || 'Unknown error.', variant: 'destructive', duration: 7000 });
        setFileName(null); setText(''); setWords([]); setActualWordCount(0);
      } finally {
        if (event.target) event.target.value = ''; // Clear file input
         // Final check to clear ref if it still matches the loading toast
         if (loadingToastId && toastCtrlRef.current?.id === loadingToastId) {
            toastCtrlRef.current = null;
         }
      }
    },
    [toast, dismiss] // Include dismiss in dependency array
  );

  // --- Control Actions ---

  const togglePlay = () => {
    if (words.length === 0) {
      toast({ title: 'No Text', description: 'Please upload a file.', variant: 'destructive' });
      return;
    }
    if (currentIndex >= words.length) {
      // If at the end, reset and play from start
      setCurrentIndex(0);
      setProgress(0);
      setIsPlaying(true); // Start playing immediately
      toast({ title: "Restarting" });
    } else {
      // Toggle play/pause
      setIsPlaying((prev) => {
        const newState = !prev;
        // Clear timeout if pausing manually
        if (!newState && timeoutRef.current) clearTimeout(timeoutRef.current);
        return newState;
      });
    }
  };

  const goToNextChunk = useCallback(() => {
    if (isPlaying) setIsPlaying(false); // Pause if playing
    if (currentIndex < words.length) {
      const { endIndex } = findChunkInfo(currentIndex, chunkWordTarget, words);
      setCurrentIndex(endIndex >= words.length ? words.length : endIndex); // Move to next chunk or end
    }
  }, [currentIndex, words, chunkWordTarget, isPlaying]);

  const goToPreviousChunk = useCallback(() => {
    if (isPlaying) setIsPlaying(false); // Pause if playing
    const previousStartIndex = findPreviousChunkStart(currentIndex, chunkWordTarget, words);
    setCurrentIndex(previousStartIndex); // Move to the start of the previous chunk
  }, [currentIndex, chunkWordTarget, words, isPlaying]);

  const goToBeginning = useCallback(() => {
    if (isPlaying) setIsPlaying(false);
    setCurrentIndex(0);
    setProgress(0); // Reset progress visually
    toast({ title: "Jumped to Beginning" });
  }, [isPlaying, toast]);

  const handleProgressClick = useCallback((clickPercentage: number) => {
    if (actualWordCount === 0 || words.length === 0) return;
    if (isPlaying) setIsPlaying(false); // Pause if playing
    const targetWordNum = Math.max(1, Math.ceil(actualWordCount * clickPercentage));
    const targetChunkStartIndex = findChunkStartForWordIndex(targetWordNum, chunkWordTarget, words);
    setCurrentIndex(targetChunkStartIndex);
  }, [actualWordCount, words, chunkWordTarget, isPlaying]);


  // --- Memoized Values for Display ---

  // Use the memoized currentChunkInfo for display tokens
  const currentTokensForDisplay = useMemo(() =>
    words.slice(currentIndex, currentChunkInfo.endIndex),
    [words, currentIndex, currentChunkInfo.endIndex]
  );

  // Determine if the *next* chunk can be navigated to
  const canGoNext = currentIndex < words.length;
  // Determine if the *previous* chunk can be navigated to
  const canGoPrevious = currentIndex > 0;


  // Return state and handlers
  return {
    words,
    actualWordCount,
    currentIndex,
    wpm,
    setWpm,
    chunkWordTarget,
    setChunkWordTarget,
    isPlaying,
    fileName,
    progress,
    isChunkSizeAdjusted, // Expose this state
    togglePlay,
    handleFileUpload,
    goToNextChunk,
    goToPreviousChunk,
    goToBeginning,
    handleProgressClick,
    currentTokensForDisplay,
    canGoNext, // Expose navigation states
    canGoPrevious, // Expose navigation states
  };
}
