
'use client';

import { useState, useEffect, useCallback } from 'react';

type BackgroundType = 'color' | 'image' | 'custom';
type BackgroundValue = string; // URL for image, data URL for custom, empty string for theme color

const LOCAL_STORAGE_KEY_TYPE = 'rapidreader_background_type';
const LOCAL_STORAGE_KEY_VALUE = 'rapidreader_background_value';

// Default background images (using picsum placeholders)
// Added data-ai-hint conceptually here, though it's applied in the component
export const DEFAULT_IMAGES: Record<string, { url: string; hint: string }> = {
  'default1': { url: 'https://png.pngtree.com/background/20210711/original/pngtree-read-more-books-on-campus-picture-image_1126340.jpg', hint: 'abstract book texture' },
  'default2': { url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRaFkmzL62dQu7KRjBI2TfnB5nyN4vXxjIofGNYr275ioWXxDvhyb13ELrf_HNJIzX0F-4&usqp=CAU', hint: 'building blocks' },
};

// Default to a texture-like image initially
const DEFAULT_BACKGROUND_TYPE: BackgroundType = 'image';
const DEFAULT_BACKGROUND_VALUE: BackgroundValue = DEFAULT_IMAGES['default1'].url; // Use a default image URL


export function useBackground() {
  // Initialize state with the default image settings
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(DEFAULT_BACKGROUND_TYPE);
  const [backgroundValue, setBackgroundValue] = useState<BackgroundValue>(DEFAULT_BACKGROUND_VALUE);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load initial background from localStorage, overriding defaults if present
  useEffect(() => {
    // This effect should only run on the client after mount
    try {
      const storedType = localStorage.getItem(LOCAL_STORAGE_KEY_TYPE) as BackgroundType | null;
      const storedValue = localStorage.getItem(LOCAL_STORAGE_KEY_VALUE);

      if (storedType && storedValue !== null) {
        // Validate stored type
        if (['color', 'image', 'custom'].includes(storedType)) {
          setBackgroundType(storedType);
          setBackgroundValue(storedValue);
        } else {
          // Invalid type found, reset to default and clear storage
          setBackgroundType(DEFAULT_BACKGROUND_TYPE);
          setBackgroundValue(DEFAULT_BACKGROUND_VALUE);
           console.warn('[useBackground] Invalid type in localStorage, reset to default image.');
        }
      } else {
         console.log('[useBackground] No valid localStorage found, using default image background.');
        // No stored preference, state already initialized with defaults above
      }
    } catch (error) {
      console.error("Error reading background preference from localStorage:", error);
      // Fallback to default if localStorage reading fails
      setBackgroundType(DEFAULT_BACKGROUND_TYPE);
      setBackgroundValue(DEFAULT_BACKGROUND_VALUE);
    } finally {
      setIsInitialized(true);
    }
  }, []); // Run only once on mount

  // Apply background style to body and save changes to localStorage
  useEffect(() => {
    // Only apply/save after initialization to avoid premature writes and SSR issues
    if (!isInitialized || typeof window === 'undefined') return;
    // console.log(`[useBackground] Applying type: ${backgroundType}, value: ${backgroundValue.substring(0, 50)}...`);

    const readingDisplay = document.querySelector('main') as HTMLElement | null;

    if (readingDisplay) {
      try { // Start try block
        readingDisplay.style.backgroundImage = ''; // Reset any previous image
        readingDisplay.style.backgroundSize = '';
        readingDisplay.style.backgroundPosition = '';
        readingDisplay.style.backgroundRepeat = '';
        readingDisplay.style.backgroundAttachment = '';
        readingDisplay.style.backgroundColor = 'transparent'; // Ensure it's always transparent


        if (backgroundType === 'color') {
          // Theme color is handled by CSS variables, set bg image to none
          // mainElement.style.backgroundColor = 'var(--theme-background)'; // Example, actual color from CSS
          readingDisplay.style.backgroundImage = 'none';
          localStorage.setItem(LOCAL_STORAGE_KEY_TYPE, 'color');
          localStorage.setItem(LOCAL_STORAGE_KEY_VALUE, ''); // Empty string signifies theme color
        } else if (backgroundType === 'image' || backgroundType === 'custom') {
          // Apply image styles
          readingDisplay.style.backgroundImage = `url("${backgroundValue}")`;
          readingDisplay.style.backgroundSize = 'cover';
          readingDisplay.style.backgroundPosition = 'center center'; // Explicitly center
          readingDisplay.style.backgroundRepeat = 'no-repeat';
          readingDisplay.style.backgroundAttachment = 'fixed'; // Keep background fixed during scroll

          // Note: backgroundColor is always transparent for images, handled above

          // Save preference
          localStorage.setItem(LOCAL_STORAGE_KEY_TYPE, backgroundType);
          localStorage.setItem(LOCAL_STORAGE_KEY_VALUE, backgroundValue);
          console.log(`[useBackground] Applied ${backgroundType} background:`, backgroundValue.substring(0, 60) + '...');
        }
        //    console.log('[useBackground] Body style after update:', document.body.style.backgroundImage, document.body.style.backgroundColor);
      } catch (error) { // Catch block immediately follows try
        console.error("Error applying background or saving to localStorage:", error);
      }
    } else {
    }
  }, [backgroundType, backgroundValue, isInitialized]); // Re-run when type, value, or init state changes


  const updateBackground = useCallback((type: BackgroundType, value: BackgroundValue) => {
    setBackgroundType(type);
    setBackgroundValue(value);
  }, []);

  const setBackgroundColor = useCallback(() => {
    updateBackground('color', ''); // Empty string value signifies using the theme color from CSS
  }, [updateBackground]);

  const setBackgroundImage = useCallback((imageUrl: string) => {
    updateBackground('image', imageUrl);
  }, [updateBackground]);

  const setCustomBackground = useCallback((dataUrl: string) => {
    updateBackground('custom', dataUrl);
  }, [updateBackground]);

  return {
    backgroundType,
    backgroundValue,
    setBackgroundColor,
    setBackgroundImage,
    setCustomBackground,
    defaultImages: DEFAULT_IMAGES,
    isInitialized, // Expose initialization state if needed by UI
  };
}
