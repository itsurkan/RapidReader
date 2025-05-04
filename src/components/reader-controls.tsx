
import * as React from 'react';
import { Play, Pause, Upload, ChevronLeft, ChevronRight, Rewind } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Removed Popover imports as settings are moved
// import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// import { Label } from '@/components/ui/label';
// import { Slider } from '@/components/ui/slider';
// import { Input } from '@/components/ui/input';
// import { Separator } from '@/components/ui/separator';
// import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
// import { Palette, Image as ImageIcon } from 'lucide-react'; // Removed Palette, ImageIcon
// import { useBackground } from '@/hooks/useBackground'; // Background hook usage moved
// import { useToast } from '@/hooks/use-toast'; // Toast hook usage moved
// import { cn } from '@/lib/utils'; // cn utility moved if only used for background settings

interface ReaderControlsProps {
  // Removed props related to settings that are moved to Header
  // wpm: number;
  // setWpm: (wpm: number) => void;
  // chunkWordTarget: number;
  // setChunkWordTarget: (count: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | null;
  goToNextChunk: () => void;
  goToPreviousChunk: () => void;
  goToBeginning: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

export function ReaderControls({
  // Removed destructured props related to settings
  // wpm,
  // setWpm,
  // chunkWordTarget,
  // setChunkWordTarget,
  isPlaying,
  togglePlay,
  onFileUpload,
  fileName,
  goToNextChunk,
  goToPreviousChunk,
  goToBeginning,
  canGoNext,
  canGoPrevious,
}: ReaderControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Removed background image input ref and related handlers
  // const bgImageInputRef = React.useRef<HTMLInputElement>(null);
  // const { toast } = useToast(); // Moved
  // Background hook state usage moved to Header
  // const { ... } = useBackground();

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Removed handleBgImageUploadClick and handleCustomBgUpload

  // Removed radioValue calculation

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card p-4 shadow-md border-t flex items-center justify-between z-10"> {/* Lowered z-index */}
      {/* Left Section: Upload and File Name */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Button variant="outline" size="icon" onClick={handleUploadClick} aria-label="Upload Text File">
          <Upload />
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileUpload}
          accept=".txt,.epub"
          className="hidden"
        />
         {fileName && (
          <span className="text-sm text-muted-foreground truncate" title={fileName}>
            {fileName}
          </span>
        )}
      </div>

      {/* Center Section: Play/Pause and Navigation */}
       {/* Adjusted flex properties: flex-grow to allow center section to expand */}
      <div className="flex items-center justify-center gap-1 flex-grow">
         <Button
          variant="ghost"
          size="icon"
          onClick={goToBeginning}
          disabled={!canGoPrevious}
          aria-label="Go to Beginning"
        >
          <Rewind />
        </Button>
         <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousChunk}
          disabled={!canGoPrevious}
          aria-label="Previous Chunk"
        >
          <ChevronLeft />
        </Button>
        <Button variant="secondary" size="icon" onClick={togglePlay} aria-label={isPlaying ? 'Pause Reading' : 'Start Reading'}>
          {isPlaying ? <Pause /> : <Play />}
        </Button>
         <Button
          variant="ghost"
          size="icon"
          onClick={goToNextChunk}
          disabled={!canGoNext}
          aria-label="Next Chunk"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Right Section: Empty placeholder to balance the layout */}
      <div className="flex items-center justify-end flex-1">
         {/* Settings button moved to Header */}
      </div>
    </div>
  );
}

