import { useRef, useState } from "react";

/** Inspect the real product photograph without re-encoding its pixels. */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<{ x: number; y: number } | null>(null);

  function changeZoom(next: number) {
    const limited = Math.max(1, Math.min(5, Math.round(next * 10) / 10));
    setZoom(limited);
    if (limited === 1) setPan({ x: 0, y: 0 });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-secondary/30">
      <div
        className="relative flex h-[min(65vh,650px)] cursor-grab items-center justify-center overflow-hidden bg-background active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(zoom + (event.deltaY < 0 ? 0.3 : -0.3));
        }}
        onPointerDown={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pointer.current || zoom === 1) return;
          const { x, y } = pointer.current;
          pointer.current = { x: event.clientX, y: event.clientY };
          setPan((current) => ({
            x: current.x + event.clientX - x,
            y: current.y + event.clientY - y,
          }));
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="h-full w-full select-none object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-line bg-background p-2">
        <button
          type="button"
          aria-label="Diminuir zoom da foto"
          onClick={() => changeZoom(zoom - 0.5)}
          className="rounded-full border border-line px-3 py-1 text-sm"
        >
          −
        </button>
        <span className="min-w-12 text-center font-mono text-xs text-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Aumentar zoom da foto"
          onClick={() => changeZoom(zoom + 0.5)}
          className="rounded-full border border-line px-3 py-1 text-sm"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            changeZoom(1);
          }}
          className="rounded-full border border-line px-3 py-1 text-xs"
        >
          Redefinir
        </button>
      </div>
    </div>
  );
}
