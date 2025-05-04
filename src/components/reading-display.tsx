
import * as React from 'react';
import { cn } from '@/lib/utils';

interface ReadingDisplayProps {
  words: string[]; // The chunk of words to display
  pivotIndex: number; // Index of the pivot character within the *first word* of the chunk
}

export function ReadingDisplay({ words, pivotIndex }: ReadingDisplayProps) {
  const displayedText = words.join(' ');

  // Ensure the passed pivotIndex (relative to the first word) is valid within the context of the *entire displayed chunk*
  // It should highlight a character within the first word.
  const validPivotIndex = Math.max(0, Math.min(pivotIndex, (words[0]?.length || 1) - 1));

  // Highlight the character at the calculated pivot index *within the combined text*
  const highlightCharacter = (text: string, index: number) => {
    // Ensure index is within bounds of the combined text
     const safeIndex = Math.max(0, Math.min(index, text.length - 1));
     if (text.length === 0) return ''; // Handle empty string case

    const before = text.substring(0, safeIndex);
    const char = text.charAt(safeIndex);
    const after = text.substring(safeIndex + 1);
    return (
      <>
        {before}
        <span className="text-accent font-bold">{char}</span>
        {after}
      </>
    );
  };

  // Apply highlighting to the joined text based on the first word's pivot index
  const highlightedText = highlightCharacter(displayedText, validPivotIndex);


  return (
    <div className="flex flex-col items-center justify-center h-full text-4xl md:text-6xl font-mono relative px-4">
       {/* Top and bottom guide lines */}
       <div className="absolute top-1/3 left-0 right-0 h-px bg-muted-foreground/30"></div>
       <div className="absolute bottom-1/3 left-0 right-0 h-px bg-muted-foreground/30"></div>
       {/* Center vertical guide line, aligned with the pivot character's approximate position */}
       {/* Note: Precise alignment is tricky with variable width fonts. This is an approximation. */}
       <div
        className="absolute top-1/3 bottom-1/3 w-px bg-accent"
        // Attempt to position the line based on the pivot character's position
        // This is complex and might need a more robust solution (e.g., measuring char widths)
        // For now, a simple approximation based on character index might suffice visually
        style={{ left: `calc(50% + ${validPivotIndex - displayedText.length / 2}ch * 0.1)` }} // Crude adjustment factor
       ></div>


      <div className="text-center w-full" style={{ animation: 'fadeIn 0.1s ease-out' }}>
         {/* Render the highlighted text */}
         {highlightedText}
      </div>

      {/* Add keyframes for fadeIn animation */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0.3; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        /* Ensure mono font is applied for better (though not perfect) alignment */
        .font-mono {
             font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
      `}</style>
    </div>
  );
}
