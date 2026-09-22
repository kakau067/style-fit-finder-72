import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-card", className)}>{children}</div>
  );
}

export function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-clay rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-line bg-background text-secondary-foreground hover:border-foreground/40",
      )}
    >
      {children}
    </button>
  );
}

export function Meter({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function MeasureField({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
  estimated,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  estimated?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-background px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-secondary-foreground">{label}</span>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {value.toFixed(step < 1 ? 1 : 0)}
          <span className="text-muted-foreground"> cm</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="focus-clay mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      {estimated ? (
        <p className="mt-1 text-[11px] text-muted-foreground">estimado pela análise da foto</p>
      ) : null}
    </div>
  );
}

export function StepRail({
  steps,
  current,
  onJump,
}: {
  steps: string[];
  current: number;
  onJump?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={!onJump || index > current}
              onClick={() => onJump?.(index)}
              className={cn(
                "focus-clay flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left transition-colors",
                index <= current && onJump ? "cursor-pointer hover:bg-secondary" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border font-mono text-[10px]",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary text-primary"
                      : "border-line text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "text-[13px]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </button>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-line sm:block" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "focus-clay inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:brightness-105 active:translate-y-px",
        variant === "outline" &&
          "border border-line bg-background text-foreground hover:border-foreground/40 active:translate-y-px",
        variant === "ghost" && "text-secondary-foreground hover:bg-secondary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
