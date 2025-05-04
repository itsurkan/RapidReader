
import * as React from 'react';
import { Settings, Play, Pause, Upload, ChevronLeft, ChevronRight, Rewind, Image as ImageIcon, Palette } from 'lucide-react'; // Added ImageIcon, Palette
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'; // Added RadioGroup
import { useBackground } from '@/hooks/useBackground'; // Import useBackground hook
import { useToast } from '@/hooks/use-toast'; // Import useToast

interface ReaderControlsProps {
  wpm: number;
  setWpm: (wpm: number) => void;
  chunkWordTarget: number;
  setChunkWordTarget: (count: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | null;
  goToNextChunk: () => void;
  goToPreviousChunk: () => void;
  goToBeginning: () => void; // New prop for beginning
  canGoNext: boolean;
  canGoPrevious: boolean;
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
  goToBeginning, // Receive the new function
  canGoNext,
  canGoPrevious,
}: ReaderControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bgImageInputRef = React.useRef<HTMLInputElement>(null); // Ref for background image input
  const { toast } = useToast();
  const {
    backgroundType,
    backgroundValue,
    setBackgroundColor,
    setBackgroundImage,
    setCustomBackground,
    defaultImages,
    isInitialized,
  } = useBackground();

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleBgImageUploadClick = () => {
    bgImageInputRef.current?.click();
  };

  const handleCustomBgUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          setCustomBackground(e.target.result);
        } else {
           toast({ title: "Error Reading File", description: "Could not read the image file.", variant: "destructive" });
        }
      };
      reader.onerror = () => {
        toast({ title: "Error Reading File", description: "Could not read the image file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    }
     // Reset file input value to allow re-uploading the same file
     if (event.target) {
       event.target.value = '';
     }
  };

  // Determine the value for the RadioGroup based on current background state
  const radioValue = isInitialized
    ? backgroundType === 'color'
      ? 'theme-color'
      : backgroundType === 'custom'
      ? 'custom-image'
      : backgroundValue // For default images, the value is the URL itself
    : 'theme-color'; // Default selection before initialization

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card p-4 shadow-md border-t flex items-center justify-between z-50">
      {/* Left Section: Upload and File Name */}
      <div className="flex items-center gap-4 flex-1 min-w-0"> {/* Added flex-1 and min-w-0 */}
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
          <span className="text-sm text-muted-foreground truncate" title={fileName}> {/* Removed max-w-xs */}
            {fileName}
          </span>
        )}
      </div>

      {/* Center Section: Play/Pause and Navigation */}
      <div className="flex items-center justify-center gap-1 flex-shrink-0"> {/* Reduced gap for tighter controls */}
         <Button
          variant="ghost"
          size="icon"
          onClick={goToBeginning} // Add onClick handler
          disabled={!canGoPrevious} // Disable if already at beginning
          aria-label="Go to Beginning"
        >
          <Rewind /> {/* Use Rewind icon */}
        </Button>
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
          <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto" side="top" align="end">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Settings</h4>
                <p className="text-sm text-muted-foreground">
                  Adjust reading settings.
                </p>
              </div>
              <Separator />
              {/* Reading Settings */}
              <div className="grid gap-2">
                 <Label className="text-xs text-muted-foreground">Reading</Label>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="wpm">WPM</Label>
                  <Slider
                    id="wpm"
                    min={50}
                    max={1500} // Increased max WPM
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
              <Separator />
              {/* Background Settings */}
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Background</Label>
                {isInitialized && (
                  <RadioGroup
                    value={radioValue}
                    onValueChange={(value) => {
                      if (value === 'theme-color') {
                        setBackgroundColor();
                      } else if (value === 'custom-image') {
                        // If custom is selected but no value yet, trigger upload
                        if (backgroundType !== 'custom') {
                           handleBgImageUploadClick();
                        }
                        // If there's already a custom value, just ensure it's set
                        else if (backgroundValue) {
                           setCustomBackground(backgroundValue);
                        }
                      } else {
                        // It's a default image URL
                        setBackgroundImage(value);
                      }
                    }}
                    className="grid grid-cols-3 gap-2" // Use grid for layout
                  >
                    <Label
                      htmlFor="bg-theme-color"
                      className={cn(
                        "cursor-pointer rounded-md border p-2 hover:bg-accent hover:text-accent-foreground",
                        radioValue === 'theme-color' && "bg-accent text-accent-foreground"
                      )}
                    >
                       <RadioGroupItem value="theme-color" id="bg-theme-color" className="sr-only" />
                       <div className="flex flex-col items-center gap-1">
                         <Palette className="w-5 h-5" />
                         <span className="text-xs">Theme</span>
                       </div>
                    </Label>
                    {Object.entries(defaultImages).map(([key, url]) => (
                      <Label
                        key={key}
                        htmlFor={`bg-${key}`}
                        className={cn(
                          "relative cursor-pointer rounded-md border p-2 hover:border-accent [&:has(:checked)]:border-accent",
                           radioValue === url && "border-accent" // Keep border highlighted
                        )}
                        data-ai-hint="abstract landscape nature"
                      >
                        <RadioGroupItem value={url} id={`bg-${key}`} className="sr-only" />
                        <img
                          src={url}
                          alt={`Default Background ${key.replace('default', '')}`}
                          className="h-10 w-full rounded object-cover"
                          loading="lazy"
                        />
                         <span className="text-xs absolute bottom-0.5 left-0.5 right-0.5 bg-black/50 text-white/90 text-center rounded-b">
                            Default {key.replace('default', '')}
                         </span>
                      </Label>
                    ))}
                     <Label
                        htmlFor="bg-custom-image"
                        className={cn(
                          "cursor-pointer rounded-md border p-2 hover:bg-accent hover:text-accent-foreground",
                           radioValue === 'custom-image' && "bg-accent text-accent-foreground"
                        )}
                        onClick={(e) => {
                           // Prevent label click from immediately triggering radio change if already custom
                           if (radioValue === 'custom-image') {
                               e.preventDefault(); // Stop label's default radio selection behavior
                               handleBgImageUploadClick(); // Trigger file input instead
                           }
                           // If not custom, let the normal radio change happen, which will then trigger the upload
                         }}
                      >
                       <RadioGroupItem value="custom-image" id="bg-custom-image" className="sr-only" />
                       <div className="flex flex-col items-center gap-1">
                         <ImageIcon className="w-5 h-5" />
                         <span className="text-xs">Custom</span>
                       </div>
                    </Label>
                  </RadioGroup>
                )}
                 <input
                    type="file"
                    ref={bgImageInputRef}
                    onChange={handleCustomBgUpload}
                    accept="image/*"
                    className="hidden"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
