
'use client';

import * as React from 'react';
import { Header } from '@/components/header'; // Import the new Header component
import { ReaderControls } from '@/components/reader-controls';
import { ReadingDisplay } from '@/components/reading-display';
import { Progress } from '@/components/ui/progress';
import { useReaderState } from '@/hooks/useReaderState';
import { isActualWord } from '@/lib/readingUtils';

// Helper function to calculate the pivot character index within a token
const calculatePivot = (token: string): number => {
    if (!token) return 0;
    const len = Math.max(1, token.length);
    return Math.max(0, Math.min(Math.floor(len / 3), len - 1));
};


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

    const firstTokenPivotIndex = calculatePivot(currentTokensForDisplay[0] || '');

    const canGoPrevious = currentIndex > 0;
    const canGoNext = currentIndex < words.length;

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
             {/* Render Header, passing WPM and Chunk Size props */}
             <Header
                wpm={wpm}
                setWpm={setWpm}
                chunkWordTarget={chunkWordTarget}
                setChunkWordTarget={setChunkWordTarget}
            />

             {/* Progress bar adjusted to be below the header */}
             <Progress
                value={progress}
                className="w-full h-2 fixed top-14 left-0 z-10 cursor-pointer" // Positioned below header, lower z-index
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

             {/* Adjust main content padding to account for Header and Controls */}
             <main className="flex-grow flex items-center justify-center overflow-hidden pt-20 pb-20 px-4"> {/* Increased pt */}
                {words.length > 0 ? (
                    <ReadingDisplay
                        tokens={currentTokensForDisplay}
                        pivotIndex={firstTokenPivotIndex}
                        isAdjusted={isChunkSizeAdjusted}
                    />
                ) : (
                    <div className="text-center text-muted-foreground">
                        <p>Upload a .txt or .epub file to begin.</p>
                        {fileName && <p className="text-sm mt-2">Last attempt: {fileName}</p>}
                    </div>
                )}
            </main>

             {/* Render Controls, removing WPM and Chunk Size props */}
             <ReaderControls
                // wpm={wpm} // Removed
                // setWpm={setWpm} // Removed
                // chunkWordTarget={chunkWordTarget} // Removed
                // setChunkWordTarget={setChunkWordTarget} // Removed
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
