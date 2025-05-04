import * as React from 'react';
import { Settings, Play, Pause, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface ReaderControlsProps {
  wpm: number;
  setWpm: (wpm: number) => void;
  chunkWordTarget: number;
  setChunkWordTarget: (count: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | null;
  goToNextChunk: () => void; // New prop for next chunk
  goToPreviousChunk: () => void; // New prop for previous chunk
  canGoNext: boolean; // New prop to enable/disable next
  canGoPrevious: boolean; // New prop to enable/disable previous
}

export function ReaderControls({
  wpm,
  setWpm,
  chunkWordTarget,
  setChunkWordTarget,
  isPlaying,
  togglePlay,
  onFileUpload,
  fileName,
  goToNextChunk,
  goToPreviousChunk,
  canGoNext,
  canGoPrevious,
}: ReaderControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card p-4 shadow-md border-t flex items-center justify-between z-50">
      {/* Left Section: Upload and File Name */}
      <div className="flex items-center gap-4 flex-1 min-w-0"> {/* Added flex-1 and min-w-0 */}
        <Button variant="outline" size="icon" onClick={handleUploadClick} aria-label="Upload File">
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
          <span className="text-sm text-muted-foreground truncate" title={fileName}> {/* Removed max-w-xs */}
            {fileName}
          </span>
        )}
      </div>

      {/* Center Section: Play/Pause and Navigation */}
      <div className="flex items-center justify-center gap-2 flex-shrink-0"> {/* Added justify-center */}
         <Button
          variant="ghost" // Changed to ghost for less emphasis
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
          variant="ghost" // Changed to ghost
          size="icon"
          onClick={goToNextChunk}
          disabled={!canGoNext}
          aria-label="Next Chunk"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Right Section: Settings */}
      <div className="flex items-center justify-end gap-4 flex-1"> {/* Added justify-end and flex-1 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Settings">
              <Settings />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" side="top" align="end">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Settings</h4>
                <p className="text-sm text-muted-foreground">
                  Adjust reading speed and chunk size.
                </p>
              </div>
              <Separator />
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="wpm">WPM</Label>
                  <Slider
                    id="wpm"
                    min={50}
                    max={1000}
                    step={10}
                    value={[wpm]}
                    onValueChange={(value) => setWpm(value[0])}
                    className="col-span-2"
                    aria-label={`Words per minute: ${wpm}`}
                  />
                </div>
                 <div className="text-center text-sm text-muted-foreground">{wpm} WPM</div>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="words-chunk">Words</Label>
                   <Slider
                    id="words-chunk"
                    min={1}
                    max={10}
                    step={1}
                    value={[chunkWordTarget]}
                    onValueChange={(value) => setChunkWordTarget(value[0])}
                    className="col-span-2"
                     aria-label={`Target words per chunk: ${chunkWordTarget}`}
                  />
                </div>
                 <div className="text-center text-sm text-muted-foreground">{chunkWordTarget} {chunkWordTarget === 1 ? 'word' : 'words'} / chunk</div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
