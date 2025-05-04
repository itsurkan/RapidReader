import * as React from 'react';
import { cn } from '@/lib/utils';

interface ReadingDisplayProps {
  words: string[]; // The chunk of words to display
  pivotIndex: number; // Index of the pivot character within the word(s)
}

export function ReadingDisplay({ words, pivotIndex }: ReadingDisplayProps) {
  const displayedText = words.join(' ');

  // Ensure pivotIndex is valid
  const validPivotIndex = Math.max(0, Math.min(pivotIndex, displayedText.length - 1));

  const beforePivot = displayedText.substring(0, validPivotIndex);
  const pivotChar = displayedText.charAt(validPivotIndex);
  const afterPivot = displayedText.substring(validPivotIndex + 1);

  // Calculate optimal pivot point (around 1/3rd from the start)
   const calculatePivot = (word: string): number => {
    if (!word) return 0;
    return Math.floor(word.length / 3);
   };

  // Recalculate pivot based on the first word in the chunk
  const firstWordPivotIndex = calculatePivot(words[0] || '');

   // Highlight the character at the calculated pivot index
  const highlightCharacter = (text: string, index: number) => {
    const before = text.substring(0, index);
    const char = text.charAt(index);
    const after = text.substring(index + 1);
    return (
      <>
        {before}
        <span className="text-accent font-bold">{char}</span>
        {after}
      </>
    );
  };

  // Apply highlighting to the joined text based on the first word's pivot
  const highlightedText = highlightCharacter(displayedText, firstWordPivotIndex);


  return (
    <div className="flex flex-col items-center justify-center h-full text-4xl md:text-6xl font-mono relative px-4">
       {/* Top and bottom guide lines */}
       <div className="absolute top-1/3 left-0 right-0 h-px bg-muted-foreground/30"></div>
       <div className="absolute bottom-1/3 left-0 right-0 h-px bg-muted-foreground/30"></div>
       {/* Center vertical guide line */}
       <div className="absolute left-1/2 top-1/3 bottom-1/3 w-px bg-accent"></div>

      <div className="text-center w-full" style={{ animation: 'fadeIn 0.1s ease-out' }}>
         {highlightedText}
      </div>

      {/* Add keyframes for fadeIn animation */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0.3; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
