import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorNote, Eyebrow } from "@/components/provador/primitives";
import { ZoomableImage } from "@/components/provador/ZoomableImage";
import type { Product } from "@/data/catalog";
import { dataURLToFile } from "@/lib/image-utils";
import { streamImage } from "@/lib/stream-image";
import { compositeTryOn, garmentRegion } from "@/lib/tryon-composite";
import type { Body, FitPref, Size } from "@/lib/sizing";

const Mannequin3D = lazy(() => import("@/components/provador/Mannequin3D").then(({ Mannequin3D }) => ({ default: Mannequin3D })));

export type TryOnRequest = { product: Product; size: Size; fitPref: FitPref; photoDataUrl: string; body: Body; audience: "feminino" | "masculino" };
type View = "photo" | "mannequin" | "detail";
type QueueJob = { requestId: string; ticket: string; model?: "idm" | "fashn"; responseUrl?: string };
type TryOnProvider = "auto" | "gemini" | "fal";
const pendingJobs = new Map<string, QueueJob>();
const pendingSubmissions = new Map<string, Promise<{ job?: QueueJob; response?: Response }>>();
const completedResults = new Map<string, string>();

function rememberResult(key: string, image: string) {
  completedResults.delete(key);
  completedResults.set(key, image);
  if (completedResults.size > 6) completedResults.delete(completedResults.keys().next().value!);
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2500);
    const abort = () => { window.clearTimeout(timer); reject(new DOMException("Cancelado", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function TryOnOverlay({ request, onClose }: { request: TryOnRequest; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("Preparando a prova visual…");
  const [compare, setCompare] = useState(50);
  const [generated, setGenerated] = useState<string | null>(null);
  const [region, setRegion] = useState(() => garmentRegion(request.product));
  const [view, setView] = useState<View>("mannequin");
  const viewRef = useRef<View>("mannequin");
  const [detailImage, setDetailImage] = useState(() => request.product.images.detail !== request.product.images.front ? request.product.images.detail : request.product.images.front);
  const abortRef = useRef<AbortController | null>(null);
  const productPhotos = (["front", "back", "detail"] as const)
    .filter((kind, index, kinds) => kinds.findIndex((other) => request.product.images[other] === request.product.images[kind]) === index);

  const start = useCallback(async (retry = false, renderMode: "fast" | "quality" = "fast", provider: TryOnProvider = "auto") => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setImage(null); setGenerated(null); setDone(false); setError(null); setRunning(true); setCompare(50);
    setPhase("Preparando a prova visual…");
    const jobKey = `${request.product.id}:${request.product.images.front}:${renderMode}:${provider}:${request.photoDataUrl}`;
    if (retry) {
      pendingJobs.delete(jobKey);
      completedResults.delete(jobKey);
      setDetailImage(request.product.images.detail !== request.product.images.front ? request.product.images.detail : request.product.images.front);
    }
    try {
      const cached = completedResults.get(jobKey);
      if (cached) { setGenerated(cached); setDone(true); if (viewRef.current === "mannequin") { viewRef.current = "photo"; setView("photo"); } return; }
      let job = pendingJobs.get(jobKey);
      if (!job) {
        const form = new FormData();
        form.append("photo", dataURLToFile(request.photoDataUrl, "cliente.jpg"));
        form.append("product", request.product.id);
        form.append("size", request.size);
        form.append("fitPref", request.fitPref);
        form.append("renderMode", renderMode);
        form.append("provider", provider);
        let submitting = pendingSubmissions.get(jobKey);
        if (!submitting) {
          // Keep submission alive if the dialog closes. This prevents an
          // expensive second generation when the visitor opens it again.
          submitting = (async () => {
            const response = await fetch("/api/public/tryon", { method: "POST", body: form });
            if (!response.ok) throw new Error(`Falha na prova visual: ${response.status} ${await response.text()}`);
            if (response.status !== 202) return { response };
            const queued = (await response.json()) as QueueJob;
            pendingJobs.set(jobKey, queued);
            return { job: queued };
          })();
          pendingSubmissions.set(jobKey, submitting);
          void submitting.finally(() => pendingSubmissions.delete(jobKey)).catch(() => {});
        }
        const { job: queued, response } = await submitting;
        controller.signal.throwIfAborted();
        job = queued;
        if (response) {
          if (response.headers.get("content-type")?.includes("application/json")) {
            const result = (await response.json()) as { imageDataUrl?: string };
            if (!result.imageDataUrl) throw new Error("O Gemini não retornou uma imagem de prova.");
            rememberResult(jobKey, result.imageDataUrl);
            setGenerated(result.imageDataUrl);
            setDone(true);
            if (viewRef.current === "mannequin") { viewRef.current = "photo"; setView("photo"); }
            return;
          }
          // The gateway streams previews directly. Never submit the same costly
          // generation again when an SSE connection ends without an image.
          setPhase("Aplicando a peça à sua foto…");
          await streamImage("/api/public/tryon", form, (dataUrl, isFinal) => {
            setGenerated(dataUrl);
            if (isFinal) { rememberResult(jobKey, dataUrl); setDone(true); if (viewRef.current === "mannequin") { viewRef.current = "photo"; setView("photo"); } }
          }, controller.signal, undefined, false, response);
          return;
        }
      }
      let failures = 0;
      while (job) {
        controller.signal.throwIfAborted();
        const statusUrl = `/api/public/tryon?requestId=${encodeURIComponent(job.requestId)}&ticket=${encodeURIComponent(job.ticket)}&model=${job.model ?? "idm"}&responseUrl=${encodeURIComponent(job.responseUrl ?? "")}`;
        try {
          const response = await fetch(statusUrl, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error(`Falha ao acompanhar a prova: ${response.status} ${await response.text()}`);
          const result = (await response.json()) as { status: string; queuePosition?: number | null; imageDataUrl?: string };
          failures = 0;
          if (result.status === "COMPLETED") {
            if (!result.imageDataUrl) throw new Error("A prova não retornou uma imagem.");
            pendingJobs.delete(jobKey);
            rememberResult(jobKey, result.imageDataUrl);
            setGenerated(result.imageDataUrl);
            setDone(true);
            if (viewRef.current === "mannequin") { viewRef.current = "photo"; setView("photo"); }
            break;
          }
          setPhase(result.status === "IN_QUEUE"
            ? `Na fila de geração${typeof result.queuePosition === "number" ? ` · posição ${result.queuePosition + 1}` : ""}…`
            : "Aplicando a peça à sua foto…");
        } catch (cause) {
          if (controller.signal.aborted) throw cause;
          if (++failures >= 4) throw cause;
          setPhase("Reconectando à geração…");
        }
        await waitForPoll(controller.signal);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "A prova visual falhou.");
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
        <div><Eyebrow>Prova visual da peça</Eyebrow><h3 className="mt-2 font-serif text-2xl text-foreground">{request.product.name}</h3><p className="mt-1 text-sm text-secondary-foreground">Tamanho <span className="font-mono text-foreground">{request.size}</span> · caimento {request.fitPref}</p></div>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
        <div role="tablist" aria-label="Modos de visualização da peça" className="mt-5 flex flex-wrap gap-2">
          {([ ["photo", "Foto: provar em mim"], ["mannequin", "Manequim 360°"], ["detail", "Detalhes e tecido"] ] as const).map(([value, label]) => (
            <button key={value} role="tab" type="button" aria-selected={view === value} onClick={() => { viewRef.current = value; setView(value); }} className={`rounded-full border px-4 py-2 text-xs font-medium transition ${view === value ? "border-primary bg-primary text-primary-foreground" : "border-line bg-background text-foreground hover:bg-secondary"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {view === "mannequin" ? (
              <Suspense fallback={<div className="flex h-[520px] items-center justify-center rounded-xl border border-line text-sm text-muted-foreground">Carregando o manequim 3D…</div>}>
                <Mannequin3D body={request.body} audience={request.audience} product={request.product} />
              </Suspense>
            ) : view === "detail" ? <div>
              <ZoomableImage key={detailImage} src={detailImage} alt={`${detailImage === image ? "Prova visual gerada" : "Foto original da peça"} ${request.product.name} ampliada`} />
              <div className="mt-3 flex flex-wrap gap-2">
                {productPhotos.map((kind) => <button key={kind} type="button" aria-pressed={detailImage === request.product.images[kind]} onClick={() => setDetailImage(request.product.images[kind])} className={`rounded-lg border p-1 text-xs ${detailImage === request.product.images[kind] ? "border-primary" : "border-line"}`}>
                  <img src={request.product.images[kind]} alt="" className="h-16 w-16 rounded object-cover" />
                  <span className="block py-1">{{ front: "Frente", back: "Costas", detail: "Detalhe" }[kind]}</span>
                </button>)}
                {image ? <button type="button" aria-pressed={detailImage === image} onClick={() => setDetailImage(image)} className={`rounded-lg border p-1 text-xs ${detailImage === image ? "border-primary" : "border-line"}`}>
                  <img src={image} alt="" className="h-16 w-16 rounded object-cover" />
                  <span className="block py-1">Prova gerada</span>
                </button> : null}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">As fotos da roupa são as imagens originais cadastradas pela loja; a prova é gerada por IA. A nitidez depende da resolução da imagem escolhida.</p>
            </div> : <>
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-line bg-secondary">
              {image ? <>
                <img src={image} alt="Depois da prova" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${compare}%` }}><img src={request.photoDataUrl} alt="Antes da prova" className="absolute inset-0 h-full max-w-none object-cover" style={{ width: `${compare === 0 ? 100 : 10000 / compare}%` }} /></div>
                <div className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-background" style={{ left: `${compare}%` }}><span className="absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground shadow-sm">Antes / Depois</span></div>
              </> : <><img src={request.photoDataUrl} alt="Sua foto original" className="absolute inset-0 size-full object-cover" /><div role="status" aria-live="polite" className="absolute inset-x-0 bottom-0 bg-background/90 px-4 py-3 text-center font-mono text-xs uppercase tracking-[0.15em] text-foreground">{running ? phase : error ? "Sua foto original está preservada" : "Compondo a imagem…"}</div></>}
            </div>
            {image ? <label className="mt-4 block"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Antes</span><span>Depois</span></div><input type="range" min="0" max="100" value={compare} onChange={(e) => setCompare(Number(e.target.value))} aria-label="Comparador antes e depois" className="focus-clay mt-2 h-1.5 w-full cursor-ew-resize appearance-none rounded-full bg-secondary accent-primary" /></label> : null}
            {done && image ? <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <label>Início da peça<input type="range" min="8" max="50" value={Math.round(region.y * 100)} onChange={(e) => setRegion((current) => ({ ...current, y: Number(e.target.value) / 100 }))} className="mt-2 w-full accent-primary" /></label>
              <label>Fim da peça<input type="range" min="40" max="99" value={Math.round((region.y + region.height) * 100)} onChange={(e) => setRegion((current) => ({ ...current, height: Math.max(0.05, Number(e.target.value) / 100 - current.y) }))} className="mt-2 w-full accent-primary" /></label>
            </div> : null}
            </>}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">{productPhotos.map((kind) => <button type="button" key={kind} onClick={() => { setDetailImage(request.product.images[kind]); viewRef.current = "detail"; setView("detail"); }} aria-label={`Ampliar foto de ${ { front: "frente", back: "costas", detail: "detalhe" }[kind] } de ${request.product.name}`}><img src={request.product.images[kind]} alt="" className="aspect-square w-full rounded-lg border border-line object-cover hover:border-primary" /></button>)}</div>
            <p className="text-sm leading-relaxed text-secondary-foreground">{request.product.tagline}</p>
            {view === "mannequin" ? <p className="text-xs leading-relaxed text-muted-foreground">Gire e aproxime o manequim para ver a forma por todos os lados. A roupa 3D representa a modelagem e cor; abra Detalhes e tecido para ver a fotografia real da peça.</p> : null}
            {running ? <p role="status" className="text-sm text-foreground">{phase}</p> : null}
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            {request.product.storeUrl ? <a href={request.product.storeUrl} target="_blank" rel="noreferrer" className="block"><Button className="w-full">Comprar agora</Button></a> : null}
            <Button variant="outline" onClick={() => void start(true)} disabled={running} className="w-full">{running ? "Gerando…" : "Gerar de novo"}</Button>
            {!running && done ? <Button variant="outline" onClick={() => void start(false, "quality")} className="w-full">Gerar foto em alta qualidade</Button> : null}
            {!running ? <Button variant="outline" onClick={() => void start(true, "quality", "gemini")} className="w-full">Provar com Fit Check (Gemini)</Button> : null}
            {!running ? <Button variant="outline" onClick={() => void start(true, "quality", "fal")} className="w-full">Provar com Fal.ai</Button> : null}
            {running ? <p className="text-xs text-muted-foreground">Você pode fechar e voltar a esta peça; a geração em andamento será retomada.</p> : null}
            <p className="text-xs leading-relaxed text-muted-foreground">A foto original é preservada fora da área da peça escolhida. Ajuste os limites se necessário; dentro dessa área, a IA pode alterar detalhes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
