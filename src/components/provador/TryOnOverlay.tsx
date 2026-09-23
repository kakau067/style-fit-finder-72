import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorNote, Eyebrow } from "@/components/provador/primitives";
import type { Product } from "@/data/catalog";
import { dataURLToFile } from "@/lib/image-utils";
import { streamImage } from "@/lib/stream-image";
import { compositeTryOn, garmentRegion } from "@/lib/tryon-composite";
import type { FitPref, Size } from "@/lib/sizing";

export type TryOnRequest = { product: Product; size: Size; fitPref: FitPref; photoDataUrl: string };

export function TryOnOverlay({ request, onClose }: { request: TryOnRequest; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [compare, setCompare] = useState(50);
  const [generated, setGenerated] = useState<string | null>(null);
  const [region, setRegion] = useState(() => garmentRegion(request.product));
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setImage(null); setGenerated(null); setDone(false); setError(null); setRunning(true); setCompare(50);
    const form = new FormData();
    form.append("photo", dataURLToFile(request.photoDataUrl, "cliente.jpg"));
    form.append("product", request.product.id);
    form.append("size", request.size);
    form.append("fitPref", request.fitPref);
    try {
      await streamImage("/api/public/tryon", form, (dataUrl, isFinal) => {
        if (isFinal) { setGenerated(dataUrl); setDone(true); }
      }, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "A prova visual falhou.");
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  }, [request]);

  useEffect(() => {
    if (!generated) return;
    let active = true;
    void compositeTryOn(request.photoDataUrl, generated, region)
      .then((composite) => { if (active) setImage(composite); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao preservar a foto."); });
    return () => { active = false; };
  }, [generated, region, request.photoDataUrl]);

  useEffect(() => { void start(); return () => abortRef.current?.abort(); }, [start]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Prova visual — ${request.product.name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl border border-line bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Eyebrow>Prova visual com IDM-VTON</Eyebrow><h3 className="mt-2 font-serif text-2xl text-foreground">{request.product.name}</h3><p className="mt-1 text-sm text-secondary-foreground">Tamanho <span className="font-mono text-foreground">{request.size}</span> · caimento {request.fitPref}</p></div>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-line bg-secondary">
              {image ? <>
                <img src={image} alt="Depois da prova" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${compare}%` }}><img src={request.photoDataUrl} alt="Antes da prova" className="absolute inset-0 h-full max-w-none object-cover" style={{ width: `${compare === 0 ? 100 : 10000 / compare}%` }} /></div>
                <div className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-background" style={{ left: `${compare}%` }}><span className="absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground shadow-sm">Antes / Depois</span></div>
              </> : <div className="flex size-full items-center justify-center"><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">gerando com IDM-VTON…</p></div>}
            </div>
            {image ? <label className="mt-4 block"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Antes</span><span>Depois</span></div><input type="range" min="0" max="100" value={compare} onChange={(e) => setCompare(Number(e.target.value))} aria-label="Comparador antes e depois" className="focus-clay mt-2 h-1.5 w-full cursor-ew-resize appearance-none rounded-full bg-secondary accent-primary" /></label> : null}
            {done && image ? <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <label>Início da peça<input type="range" min="8" max="50" value={Math.round(region.y * 100)} onChange={(e) => setRegion((current) => ({ ...current, y: Number(e.target.value) / 100 }))} className="mt-2 w-full accent-primary" /></label>
              <label>Fim da peça<input type="range" min="40" max="99" value={Math.round((region.y + region.height) * 100)} onChange={(e) => setRegion((current) => ({ ...current, height: Math.max(0.05, Number(e.target.value) / 100 - current.y) }))} className="mt-2 w-full accent-primary" /></label>
            </div> : null}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">{(["front","back","detail"] as const).map((kind) => <img key={kind} src={request.product.images[kind]} alt={`${request.product.name} — ${kind}`} className="aspect-square w-full rounded-lg border border-line object-cover" />)}</div>
            <p className="text-sm leading-relaxed text-secondary-foreground">{request.product.tagline}</p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            {request.product.storeUrl ? <a href={request.product.storeUrl} target="_blank" rel="noreferrer" className="block"><Button className="w-full">Comprar agora</Button></a> : null}
            <Button variant="outline" onClick={() => void start()} disabled={running} className="w-full">{running ? "Gerando…" : "Gerar de novo"}</Button>
            <p className="text-xs leading-relaxed text-muted-foreground">A foto original é preservada fora da área da peça. Ajuste os limites se a troca atingir o rosto ou a calça; dentro da área, a IA pode alterar detalhes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
