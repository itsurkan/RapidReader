"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

// Extend props to include standard HTML div attributes like onClick, etc.
interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  // Potentially add custom props if needed, but standard HTML attributes are likely sufficient
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, onClick, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary/20", // Use secondary color with opacity for track
      className
    )}
    onClick={onClick} // Pass onClick handler to the root element
    // Add accessibility attributes if it behaves like a slider/seekbar
    role={onClick ? "slider" : undefined} // Conditionally add role if clickable
    aria-valuenow={value ?? 0}
    aria-valuemin={0}
    aria-valuemax={100}
    tabIndex={onClick ? 0 : undefined} // Make clickable progress bars focusable
    {...props} // Spread remaining props (like aria-label, onKeyDown, etc.)
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-secondary transition-all duration-300 ease-in-out pointer-events-none" // Use secondary (accent) color for indicator, prevent pointer events on indicator
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
