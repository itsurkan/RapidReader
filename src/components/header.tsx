
import * as React from 'react';
import { Settings, Palette, Image as ImageIcon } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBackground, DEFAULT_IMAGES } from '@/hooks/useBackground'; // Import DEFAULT_IMAGES
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface HeaderProps {
  wpm: number;
  setWpm: (wpm: number) => void;
  chunkWordTarget: number;
  setChunkWordTarget: (count: number) => void;
}

export function Header({
  wpm,
  setWpm,
  chunkWordTarget,
  setChunkWordTarget,
}: HeaderProps) {
  const bgImageInputRef = React.useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false); // Control popover state
  const { toast } = useToast();
  const {
    backgroundType,
    backgroundValue,
    setBackgroundColor,
    setBackgroundImage,
    setCustomBackground,
    // defaultImages, // Get default images from import now
    isInitialized,
  } = useBackground();

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
       event.target.value = '';
     }
  };

  // Determine the current value for the RadioGroup
  const radioValue = isInitialized
    ? backgroundType === 'color'
      ? 'theme-color'
      : backgroundType === 'custom'
      ? 'custom-image'
      : backgroundValue // This will be the URL of the selected default image or the custom data URL
    : 'theme-color'; // Default before initialization


  return (
    <header className="fixed top-0 left-0 right-0 bg-card p-2 shadow-sm border-b flex items-center justify-end z-20 h-14"> {/* Increased z-index */}
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Settings">
            <Settings />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto" side="bottom" align="end">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Settings</h4>
              <p className="text-sm text-muted-foreground">
                Adjust reading and display settings.
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
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Background</Label>
              {isInitialized && (
                <RadioGroup
                  value={radioValue}
                  onValueChange={(value) => {
                    if (value === 'theme-color') {
                      setBackgroundColor();
                      setSettingsOpen(false); // Close popover on selection
                    } else if (value === 'custom-image') {
                       // If "Custom" radio button itself is clicked, trigger file upload
                       handleBgImageUploadClick();
                       // Don't close popover, let upload handler do it
                    } else {
                      // Selecting a default image URL
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
                  {Object.entries(DEFAULT_IMAGES).map(([key, { url, hint }]) => ( // Destructure url and hint
                    <Label
                      key={key}
                      htmlFor={`bg-${key}`}
                      className={cn(
                        "relative cursor-pointer rounded-md border p-2 hover:border-accent [&:has(:checked)]:border-accent",
                         radioValue === url && "border-accent" // Check against URL
                      )}
                      data-ai-hint={hint} // Use the hint from DEFAULT_IMAGES
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
                      // This onClick should only trigger the file input if custom is already selected.
                      // The RadioGroup's onValueChange handles the initial selection.
                      onClick={(e) => {
                         if (radioValue === 'custom-image') {
                             e.preventDefault(); // Prevent radio state change
                             handleBgImageUploadClick(); // Just open file dialog
                         }
                       }}
                    >
                     {/* Value 'custom-image' helps identify this option in onValueChange */}
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
    </header>
  );
}
