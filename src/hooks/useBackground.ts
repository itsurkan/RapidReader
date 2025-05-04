
'use client';

import { useState, useEffect, useCallback } from 'react';

type BackgroundType = 'color' | 'image' | 'custom';
type BackgroundValue = string; // URL for image, data URL for custom, empty string for theme color

const LOCAL_STORAGE_KEY_TYPE = 'rapidreader_background_type';
const LOCAL_STORAGE_KEY_VALUE = 'rapidreader_background_value';

// Default background images (using picsum placeholders)
const DEFAULT_IMAGES: Record<string, string> = {
  'default1': 'https://picsum.photos/seed/bg1/1920/1080',
  'default2': 'https://picsum.photos/seed/bg2/1920/1080',
  'default3': 'https://picsum.photos/seed/bg3/1920/1080',
};

const DEFAULT_BACKGROUND_TYPE: BackgroundType = 'color';
// Default color will be picked up by the CSS variables when value is empty

export function useBackground() {
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(DEFAULT_BACKGROUND_TYPE);
  const [backgroundValue, setBackgroundValue] = useState<BackgroundValue>(''); // Color/URL
  const [isInitialized, setIsInitialized] = useState(false);

  // Load initial background from localStorage
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
          // Invalid type found, reset to default
          localStorage.removeItem(LOCAL_STORAGE_KEY_TYPE);
          localStorage.removeItem(LOCAL_STORAGE_KEY_VALUE);
          setBackgroundType(DEFAULT_BACKGROUND_TYPE);
          setBackgroundValue('');
        }
      } else {
        // No stored preference, use default (which is color initially)
        setBackgroundType(DEFAULT_BACKGROUND_TYPE);
        setBackgroundValue('');
      }
    } catch (error) {
      console.error("Error reading background preference from localStorage:", error);
      // Fallback to default if localStorage reading fails
      setBackgroundType(DEFAULT_BACKGROUND_TYPE);
      setBackgroundValue('');
    } finally {
      setIsInitialized(true);
    }
  }, []); // Run only once on mount

  // Apply background style to body and save changes to localStorage
  useEffect(() => {
    // Only apply/save after initialization to avoid premature writes and SSR issues
    if (!isInitialized || typeof window === 'undefined') return;
    console.log(`[useBackground] Applying type: ${backgroundType}, value: ${backgroundValue.substring(0, 50)}...`); // Log value substring

    try {
      if (backgroundType === 'color') {
        // Remove image styles, reset background color to let CSS variables take effect
        document.body.style.backgroundImage = '';
        // document.body.style.backgroundSize = ''; // Let browser defaults handle these
        // document.body.style.backgroundPosition = '';
        // document.body.style.backgroundRepeat = '';
        document.body.style.backgroundColor = ''; // Reset inline style to use CSS vars
        console.log('[useBackground] Applied theme color background.');
        // Save preference (value is empty string for theme color)
        localStorage.setItem(LOCAL_STORAGE_KEY_TYPE, 'color');
        localStorage.setItem(LOCAL_STORAGE_KEY_VALUE, '');
      } else if (backgroundType === 'image' || backgroundType === 'custom') {
        document.body.style.backgroundImage = `url("${backgroundValue}")`;
        document.body.style.backgroundSize = 'cover';
        // Ensure position and repeat are suitable for cover
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        // Ensure no inline background color overrides the image
        document.body.style.backgroundColor = '';
        // Save preference
        localStorage.setItem(LOCAL_STORAGE_KEY_TYPE, backgroundType);
        localStorage.setItem(LOCAL_STORAGE_KEY_VALUE, backgroundValue);
        console.log('[useBackground] Applied image background:', backgroundValue.substring(0, 60) + '...');
      }
       console.log('[useBackground] Body style after update:', document.body.style.backgroundImage, document.body.style.backgroundColor);
    } catch (error) {
       // Use console.error for errors
      console.error("Error applying background or saving to localStorage:", error);
    }
  }, [backgroundType, backgroundValue, isInitialized]);

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
