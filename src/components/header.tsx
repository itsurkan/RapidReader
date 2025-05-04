
import * as React from 'react';
// Removed unused imports like Settings, Popover, Label, Slider, Input, Separator, RadioGroup, useBackground, useToast, cn

interface HeaderProps {
  // Remove props that were only used by the settings popover
  // wpm: number;
  // setWpm: (wpm: number) => void;
  // chunkWordTarget: number;
  // setChunkWordTarget: (count: number) => void;
}

// Simplified Header component without settings
export function Header({ /* Props removed */ }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 bg-card p-2 shadow-sm border-b flex items-center justify-end z-20 h-14">
      {/* Settings Popover removed from here */}
      {/* The header might be empty or contain other elements in the future */}
    </header>
  );
}
