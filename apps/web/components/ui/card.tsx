import { cn } from "@/lib/utils";

/**
 * Panel: enstruman govdesi. Kose yaricapi kucuk, kenar cizgisi ince —
 * yuvarlak "kart" yerine olcum paneli hissi.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

/** Panel etiketi: mono, harf araligi acik, solunda kisa bir sinyal cizgisi. */
export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("label-tech flex items-center gap-2", className)} {...props}>
      <span aria-hidden className="h-px w-3 shrink-0 bg-primary" />
      {children}
    </h2>
  );
}
