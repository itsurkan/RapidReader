
'use client';

import * as React from 'react';
import { Header } from '@/components/header';
import { ReaderControls } from '@/components/reader-controls';
import { ReadingDisplay } from '@/components/reading-display';
import { Progress } from '@/components/ui/progress';
import { useReaderState } from '@/hooks/useReaderState';
import { calculatePivot } from '@/lib/pivotUtils'; // Import pivot calculation

export default function Home() {
    const {
        words,
        currentIndex,
        wpm,
        setWpm,
        chunkWordTarget,
        setChunkWordTarget,
        isPlaying,
        fileName,
        progress,
        isChunkSizeAdjusted,
        togglePlay,
        handleFileUpload,
        goToNextChunk,
        goToPreviousChunk,
        goToBeginning,
        handleProgressClick,
        currentTokensForDisplay,
    } = useReaderState();

    // Calculate pivot index based on the *first token* of the current chunk
    const firstTokenPivotIndex = calculatePivot(currentTokensForDisplay[0] || '');

    const canGoPrevious = currentIndex > 0;
    const canGoNext = currentIndex < words.length;

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
             {/* Render Header */}
             <Header />

             {/* Progress bar adjusted to be below the header */}
             <Progress
                value={progress}
                className="w-full h-2 fixed top-14 left-0 z-10 cursor-pointer" // Positioned below header
                onClick={(e) => {
                    const progressBar = e.currentTarget;
                    const clickX = e.clientX - progressBar.getBoundingClientRect().left;
                    const percentage = clickX / progressBar.offsetWidth;
                    handleProgressClick(percentage);
                }}
                aria-label={`Reading progress: ${Math.round(progress)}%`}
                role="slider"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') {
                        goToNextChunk();
                    } else if (e.key === 'ArrowLeft') {
                        goToPreviousChunk();
                    } else if (e.key === 'Home') {
                        goToBeginning();
                    }
                }}
            />

             {/* Adjust main content padding */}
             <main className="flex-grow flex items-center justify-center overflow-hidden pt-20 pb-20 px-4"> {/* Increased pt */}
                {words.length > 0 ? (
                    <ReadingDisplay
                        tokens={currentTokensForDisplay}
                        pivotIndex={firstTokenPivotIndex} // Pass calculated pivot
                        isAdjusted={isChunkSizeAdjusted}
                    />
                ) : (
                    <div className="text-center text-muted-foreground">
                        <p>Upload a .txt or .epub file to begin.</p>
                        {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
                    </div>
                )}
            </main>

             {/* Render Controls */}
             <ReaderControls
                wpm={wpm}
                setWpm={setWpm}
                chunkWordTarget={chunkWordTarget}
                setChunkWordTarget={setChunkWordTarget}
                isPlaying={isPlaying}
                togglePlay={togglePlay}
                onFileUpload={handleFileUpload}
                fileName={fileName}
                goToNextChunk={goToNextChunk}
                goToPreviousChunk={goToPreviousChunk}
                goToBeginning={goToBeginning}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
            />
        </div>
    );
}

// Potential Future Enhancements:
// - Error handling for file read/parse
// - More sophisticated text splitting (handling different punctuation, sentence structures)
// - Highlighting the pivot character more reliably (might require analyzing font metrics)
// - Remembering reading position per file
// - Storing user settings (WPM, chunk size) in localStorage
// - Theme switching (Light/Dark)
// - Keyboard shortcuts for navigation/play/pause
// - Support for more file types (PDF, DOCX - might require server-side processing or heavier libraries)
// - Performance optimization for very large files (e.g., virtualized rendering)
