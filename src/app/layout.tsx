
'use client'; // Mark RootLayout as a Client Component to use hooks

import { Inter } from 'next/font/google'; // Using Inter font for clean look
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { useBackground } from '@/hooks/useBackground'; // Import useBackground hook
import * as React from 'react'; // Import React

const inter = Inter({ subsets: ['latin'] });

// Metadata can still be defined, but it won't be dynamically updated by the hook
// You might need to move dynamic metadata to specific pages if required.
// export const metadata: Metadata = {
//   title: 'RapidReader',
//   description: 'Speed reading application',
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize the background hook.
  // The hook itself contains the useEffect to apply the background to the body on the client-side.
  useBackground(); // This call initializes the hook and its effects

  return (
    <html lang="en" suppressHydrationWarning={true}> {/* Add suppressHydrationWarning here */}
      <head>
         {/* Keep static metadata here */}
         <title>RapidReader</title>
         <meta name="description" content="Speed reading application" />
         {/* Add other static head elements if needed */}
      </head>
      <body
        className={`${inter.className} antialiased`} // Apply font and basic styling
        suppressHydrationWarning={true} // Ensure suppression is on the body tag as well
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
