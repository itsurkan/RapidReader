
import * as React from 'react';
import { cn } from '@/lib/utils';

interface ReadingDisplayProps {
  tokens: string[]; // Renamed from 'words' to 'tokens'
  pivotIndex: number; // Index of the pivot character within the *first token* of the chunk
  isAdjusted?: boolean; // Optional flag to indicate adaptive chunk size adjustment
}

export function ReadingDisplay({ tokens, pivotIndex, isAdjusted = false }: ReadingDisplayProps) {
  // Join tokens with a space for display
  const displayedText = tokens.join(' ');

  // Ensure the passed pivotIndex is valid within the *first token*
  const firstTokenLength = tokens[0]?.length || 0;
  const validPivotIndexInFirstToken = Math.max(0, Math.min(pivotIndex, Math.max(0, firstTokenLength - 1)));

  // Highlight the character at the calculated pivot index *within the combined text*
  const highlightCharacter = (text: string, index: number) => {
     const safeIndex = Math.max(0, Math.min(index, text.length - 1));
     if (text.length === 0) return '';

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

  // Apply highlighting based on the first token's pivot index
  const highlightedText = highlightCharacter(displayedText, validPivotIndexInFirstToken);

  // Generate a key based on the displayed text to force re-animation on change
  const animationKey = displayedText;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-full text-4xl md:text-6xl font-mono relative px-4 w-full transition-colors duration-300",
        // Subtle visual indicator when chunk size is adjusted
        // isAdjusted ? 'bg-secondary/10' : 'bg-transparent'
      )}
      key={animationKey} // Use key to trigger animation on content change
      style={{ animation: 'fadeIn 0.15s ease-out' }} // Apply fadeIn animation
    >
       {/* Top and bottom guide lines */}
       <div className="absolute top-1/3 left-4 right-4 h-px bg-muted-foreground/20"></div>
       <div className="absolute bottom-1/3 left-4 right-4 h-px bg-muted-foreground/20"></div>

       {/* Center vertical guide line, attempt to align with the pivot character */}
       <div
        className={cn(
            "absolute top-1/3 bottom-1/3 w-px transition-colors duration-150",
            isAdjusted ? 'bg-accent/70' : 'bg-accent/50' // Slightly more prominent if adjusted
        )}
        // Crude approximation for pivot alignment - relies on monospace font
        // Calculate offset based on pivot index relative to the center
        style={{
           // Use the first token's length for calculation
           left: `calc(50% + ${validPivotIndexInFirstToken - (tokens[0]?.length || 0) / 2}ch * 0.6)`, // Adjust multiplier as needed
           // Example: if pivot is 0 in "Hello" (length 5), offset = (0 - 2.5) * 0.6 = -1.5ch
           // Example: if pivot is 1 in "Hello" (length 5), offset = (1 - 2.5) * 0.6 = -0.9ch
           // Example: if pivot is 2 in "Hello" (length 5), offset = (2 - 2.5) * 0.6 = -0.3ch
         }}
       ></div>

      {/* Removed whitespace-nowrap, overflow-hidden, text-ellipsis to allow wrapping */}
      <div className="text-center w-full">
         {highlightedText}
      </div>

      {/* Keyframes are now defined globally in globals.css or layout if preferred, but kept here for component encapsulation */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0.2; transform: scale(0.99); }
          to { opacity: 1; transform: scale(1); }
        }
        .font-mono {
             font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
             letter-spacing: -0.02em; /* Slightly tighter spacing can look better */
        }
      `}</style>
    </div>
  );
}
