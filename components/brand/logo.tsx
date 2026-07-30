import { cn } from "@/lib/utils";

/**
 * Fluent AI logo — three overlapping CMYK ink dots (a nod to print
 * registration) forming the mark, with an ink-colored wordmark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-6", className)}
      aria-hidden
      role="img"
    >
      <g style={{ mixBlendMode: "normal" }}>
        <circle
          cx="12"
          cy="12.5"
          r="8.5"
          fill="oklch(0.7 0.13 220)"
          fillOpacity="0.9"
        />
        <circle
          cx="20"
          cy="12.5"
          r="8.5"
          fill="oklch(0.62 0.21 350)"
          fillOpacity="0.85"
        />
        <circle
          cx="16"
          cy="20"
          r="8.5"
          fill="oklch(0.83 0.14 90)"
          fillOpacity="0.85"
        />
        <circle cx="16" cy="15" r="3.4" fill="oklch(0.22 0.025 270)" />
      </g>
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark className={markClassName} />
      <span>
        Fluent<span className="text-primary"> AI</span>
      </span>
    </span>
  );
}
