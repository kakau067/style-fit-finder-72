import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorNote, Eyebrow } from "@/components/provador/primitives";
import type { Product } from "@/data/catalog";
import { dataURLToFile } from "@/lib/image-utils";
import { streamImage } from "@/lib/stream-image";
import type { FitPref, Size } from "@/lib/sizing";

export type TryOnRequest = {
  product: Product;
  size: Size;
  fitPref: FitPref;
  photoDataUrl: string;
};

export function TryOnOverlay({
  request,
  onClose,
}: {
  request: TryOnRequest;
  onClose: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setImage(null);
    setDone(false);
    setError(null);
    setRunning(true);

    const form = new FormData();
    form.append("photo", dataURLToFile(request.photoDataUrl, "cliente.jpg"));
    form.append("product", request.product.id);
    form.append("size", request.size);
    form.append("fitPref", request.fitPref);

    try {
      await streamImage(
        "/api/public/tryon",
        form,
        (dataUrl, isFinal) => {
          setImage(dataUrl);
          if (isFinal) setDone(true);
        },
        controller.signal,
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "A prova visual falhou.");
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  }, [request]);

  useEffect(() => {
    void start();
    return () => abortRef.current?.abort();
  }, [start]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Prova visual — ${request.product.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl border border-line bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Prova visual</Eyebrow>
            <h3 className="mt-2 font-serif text-2xl text-foreground">{request.product.name}</h3>
            <p className="mt-1 text-sm text-secondary-foreground">
              Tamanho{" "}
              <span className="font-mono text-foreground">{request.size}</span> · caimento{" "}
              {request.fitPref}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_260px]">
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-secondary">
            {image ? (
              <img
                src={image}
                alt={`Você vestindo ${request.product.name}`}
                className={`size-full object-cover transition-[filter] duration-700 ${
                  done ? "blur-0" : "blur-xl"
                }`}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  costurando a prova…
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <img
              src={request.product.image}
              alt={request.product.name}
              className="aspect-square w-full rounded-lg border border-line object-cover"
            />
            <p className="text-sm leading-relaxed text-secondary-foreground">
              {request.product.tagline}
            </p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button variant="outline" onClick={() => void start()} disabled={running}>
              {running ? "Gerando…" : "Gerar de novo"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Imagem gerada por IA: serve como referência de caimento, não como foto real da peça.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
