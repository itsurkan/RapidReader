import type { Book } from 'epubjs';

// Type definition for the toast function from useToast hook
export type ToastFunction = (options: any) => { id: string; dismiss: () => void; update: (props: any) => void; };
export type DismissFunction = (id: string) => void;

// Interface to hold the state during EPUB processing
export interface EpubProcessingState {
    book: Book | null;
    toastCtrl: ReturnType<ToastFunction> | null;
    bookErrorListener: ((err: any) => void) | null;
    sectionTexts: string[];
    sectionErrors: number;
    totalSections: number;
}
