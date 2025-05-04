import * as React from 'react';
import { Settings, Play, Pause, Upload } from 'lucide-react';
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
  wordsPerDisplay: number;
  setWordsPerDisplay: (count: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | null;
}

export function ReaderControls({
  wpm,
  setWpm,
  wordsPerDisplay,
  setWordsPerDisplay,
  isPlaying,
  togglePlay,
  onFileUpload,
  fileName,
}: ReaderControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card p-4 shadow-md border-t flex items-center justify-between z-50">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={handleUploadClick} aria-label="Upload File">
          <Upload />
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileUpload}
          accept=".txt,.epub" // Limiting to txt and epub for now
          className="hidden"
        />
         {fileName && (
          <span className="text-sm text-muted-foreground truncate max-w-xs" title={fileName}>
            {fileName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button variant="secondary" size="icon" onClick={togglePlay} aria-label={isPlaying ? 'Pause Reading' : 'Start Reading'}>
          {isPlaying ? <Pause /> : <Play />}
        </Button>
      </div>

      <div className="flex items-center gap-4">
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
                  Adjust reading speed and display options.
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
                  <Label htmlFor="words-display">Words</Label>
                   <Slider
                    id="words-display"
                    min={1}
                    max={5}
                    step={1}
                    value={[wordsPerDisplay]}
                    onValueChange={(value) => setWordsPerDisplay(value[0])}
                    className="col-span-2"
                     aria-label={`Words per display: ${wordsPerDisplay}`}
                  />
                </div>
                 <div className="text-center text-sm text-muted-foreground">{wordsPerDisplay} {wordsPerDisplay === 1 ? 'word' : 'words'}</div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
