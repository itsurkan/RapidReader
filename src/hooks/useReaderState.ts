
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
    isActualWord,
    getPunctuationType,
    findChunkInfo,
    findPreviousChunkStart,
    findChunkStartForWordIndex
} from '@/lib/readingUtils';
import { parseEpub } from '@/lib/epubParser';

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
  const [isChunkSizeAdjusted, setIsChunkSizeAdjusted] = useState<boolean>(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastCtrlRef = useRef<ToastController | null>(null);
  const { toast, dismiss } = useToast();

  // --- Core Reading Logic ---

  const calculateWordInterval = useCallback(() => {
    const effectiveWpm = Math.max(1, wpm);
    return (60 / effectiveWpm) * 1000;
  }, [wpm]);

  const currentChunkPunctuationInfo = useMemo(() => {
    if (currentIndex >= words.length || currentIndex <= 0) return { delayMultiplier: 1.0 };
    const previousToken = words[currentIndex - 1];
    const punctuationType = getPunctuationType(previousToken);
    if (punctuationType === 'sentence' || punctuationType === 'clause') {
      return { delayMultiplier: 3.0 }; // Triple delay
    }
    return { delayMultiplier: 1.0 };
  }, [currentIndex, words]);

  const advanceChunk = useCallback(() => {
    const { endIndex, isAdjusted } = findChunkInfo(currentIndex, chunkWordTarget, words);
    setIsChunkSizeAdjusted(isAdjusted);

    if (endIndex >= words.length) {
      setCurrentIndex(words.length);
      setIsPlaying(false);
      toast({ title: "End of Text", description: "Finished reading." });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      setCurrentIndex(endIndex);
    }
  }, [currentIndex, words, chunkWordTarget, toast]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (isPlaying && words.length > 0 && currentIndex < words.length) {
      const { delayMultiplier } = currentChunkPunctuationInfo;
      const { actualWordsInChunk, isAdjusted } = findChunkInfo(currentIndex, chunkWordTarget, words);
      setIsChunkSizeAdjusted(isAdjusted);

      const wordInterval = calculateWordInterval();
      const effectiveWords = Math.max(1, actualWordsInChunk);
      const currentDelay = wordInterval * effectiveWords * delayMultiplier;

      timeoutRef.current = setTimeout(advanceChunk, Math.max(50, currentDelay));
    }

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [isPlaying, words, currentIndex, advanceChunk, calculateWordInterval, chunkWordTarget, currentChunkPunctuationInfo]);

  // --- Progress Update ---

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

      toastCtrlRef.current = toast({ title: 'Loading File...', description: `Processing ${file.name}` });
      const loadingToastId = toastCtrlRef.current?.id;

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
          fileContent = await parseEpub(file, toast, dismiss); // Pass toast and dismiss
        } else if (lowerCaseName.endsWith('.mobi')) {
           throw new Error(".mobi files are not supported. Please use .txt or .epub.");
        } else {
           throw new Error(`Unsupported file type: "${file.name}". Please use .txt or .epub.`);
        }

        console.log(`File content length: ${fileContent.length}`);
        setText(fileContent);
        const newWords = fileContent.split(/[\s\n]+/).filter(token => token.length > 0);
        console.log(`Extracted ${newWords.length} tokens.`);
        setWords(newWords);
        const wordCount = newWords.filter(isActualWord).length;
        setActualWordCount(wordCount);
        console.log(`Counted ${wordCount} actual words.`);

        if (loadingToastId && toastCtrlRef.current?.id === loadingToastId) {
          dismiss(loadingToastId);
          toastCtrlRef.current = null;
        }

        if (newWords.length === 0 && fileContent.length > 0) {
            throw new Error("File loaded, but no tokens extracted. Check content format.");
        } else if (newWords.length === 0) {
            throw new Error("The file appears to be empty.");
        } else if (wordCount === 0) {
            throw new Error("The file contains no readable words (only punctuation/symbols?).");
        } else {
            toast({ title: 'File Loaded', description: `${file.name} is ready for reading.` });
        }
      } catch (error: any) {
        console.error('Error loading file:', error);
        if (loadingToastId && toastCtrlRef.current?.id === loadingToastId) {
           dismiss(loadingToastId);
           toastCtrlRef.current = null;
        }
        toast({ title: 'Error Loading File', description: error.message || 'Unknown error.', variant: 'destructive', duration: 7000 });
        setFileName(null); setText(''); setWords([]); setActualWordCount(0);
      } finally {
        if (event.target) event.target.value = ''; // Clear file input
        if (toastCtrlRef.current?.id === loadingToastId) {
            toastCtrlRef.current = null;
        }
      }
    },
    [parseEpub, toast, dismiss]
  );

  // --- Control Actions ---

  const togglePlay = () => {
    if (words.length === 0) {
      toast({ title: 'No Text', description: 'Please upload a file.', variant: 'destructive' });
      return;
    }
    if (currentIndex >= words.length) {
      setCurrentIndex(0); setProgress(0); setIsPlaying(true); toast({ title: "Restarting" });
    } else {
      setIsPlaying((prev) => {
        const newState = !prev;
        if (!newState && timeoutRef.current) clearTimeout(timeoutRef.current);
        return newState;
      });
    }
  };

  const goToNextChunk = useCallback(() => {
    if (isPlaying) setIsPlaying(false);
    advanceChunk();
  }, [advanceChunk, isPlaying]);

  const goToPreviousChunk = useCallback(() => {
    if (isPlaying) setIsPlaying(false);
    const previousStartIndex = findPreviousChunkStart(currentIndex, chunkWordTarget, words);
    setCurrentIndex(previousStartIndex);
  }, [currentIndex, chunkWordTarget, words, isPlaying]);

  const goToBeginning = useCallback(() => {
    if (isPlaying) setIsPlaying(false);
    setCurrentIndex(0);
    setProgress(0);
    toast({ title: "Jumped to Beginning" });
  }, [isPlaying, toast]);

  const handleProgressClick = useCallback((clickPercentage: number) => {
    if (actualWordCount === 0 || words.length === 0) return;
    setIsPlaying(false);
    const targetWordIndex = Math.max(1, Math.ceil(actualWordCount * clickPercentage));
    const targetChunkStartIndex = findChunkStartForWordIndex(targetWordIndex, chunkWordTarget, words);
    setCurrentIndex(targetChunkStartIndex);
  }, [actualWordCount, words, chunkWordTarget]);

  // --- Memoized Values for Display ---

  const { endIndex: currentChunkEndIndex } = useMemo(() =>
    findChunkInfo(currentIndex, chunkWordTarget, words),
    [currentIndex, chunkWordTarget, words]
  );

  const currentTokensForDisplay = useMemo(() =>
    words.slice(currentIndex, currentChunkEndIndex),
    [words, currentIndex, currentChunkEndIndex]
  );

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
    isChunkSizeAdjusted,
    togglePlay,
    handleFileUpload,
    goToNextChunk,
    goToPreviousChunk,
    goToBeginning,
    handleProgressClick,
    currentTokensForDisplay,
  };
}
