
import * as React from 'react';
import { Play, Pause, Upload, ChevronLeft, ChevronRight, Rewind, Settings, Palette, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBackground } from '@/hooks/useBackground';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Import cn function

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
  goToBeginning: () => void;
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
  goToBeginning,
  canGoNext,
  canGoPrevious,
}: ReaderControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bgImageInputRef = React.useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
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
          setSettingsOpen(false); // Close popover after successful custom bg set
        } else {
           toast({ title: "Error Reading File", description: "Could not read the image file.", variant: "destructive" });
        }
      };
      reader.onerror = () => {
        toast({ title: "Error Reading File", description: "Could not read the image file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    }
     if (event.target) {
       event.target.value = ''; // Reset file input
    }
  };

  const radioValue = isInitialized
    ? backgroundType === 'color'
      ? 'theme-color'
      : backgroundType === 'custom'
      ? 'custom-image'
      : backgroundValue // This could be a default image URL or the custom data URL
    : 'theme-color'; // Default before initialization


  // Ensure there are no stray characters or syntax errors before the return statement
  return ( // This corresponds to line 111 in the error message
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

      {/* Right Section: Settings Popover */}
      <div className="flex items-center justify-end flex-1">
         <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Settings">
                <Settings />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Settings</h4>
                  <p className="text-sm text-muted-foreground">
                    Adjust reading and display settings.
                  </p>
                </div>
                <Separator />
                {/* Reading Settings */}
                 <Label className="text-xs text-muted-foreground">Reading</Label>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="wpm">WPM</Label>
                    <Slider
                      id="wpm"
                      min={50}
                      max={1500}
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
                 <Label className="text-xs text-muted-foreground">Background</Label>
                 <div className="grid gap-2">
                   {isInitialized && (
                      <RadioGroup
                         value={radioValue}
                         onValueChange={(value) => {
                            console.log('value', value)
                           if (value === 'theme-color') {
                             setBackgroundColor();
                             setSettingsOpen(false); // Close popover on selection
                           } else if (value === 'custom-image') {
                               // When selecting 'custom', trigger the file input
                               handleBgImageUploadClick();
                               // Don't close popover here, let the upload handler do it
                           } else {
                             // This handles selecting a default image
                             setBackgroundImage(value);
                             setSettingsOpen(false); // Close popover on selection
                           }
                         }}
                         className="grid grid-cols-3 gap-2"
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
                                radioValue === url && "border-accent"
                             )}
                             data-ai-hint="abstract landscape nature" // Added hint for AI image search
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
                              // Prevent default radio change behavior if already custom, just trigger upload
                             onClick={(e) => {
                                if (radioValue === 'custom-image') {
                                    e.preventDefault(); // Prevent re-selecting the radio
                                    handleBgImageUploadClick(); // Trigger file input again
                                }
                              }}
                           >
                            {/* This RadioGroupItem is primarily for state management and styling */}
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
