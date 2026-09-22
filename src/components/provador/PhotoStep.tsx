import { useRef, useState } from "react";

import modeloImage from "@/assets/demo/modelo.jpg";
import { Button, ErrorNote, Eyebrow, Panel } from "@/components/provador/primitives";
import camisaImage from "@/assets/products/camisa-viscose.jpg";
import calcaImage from "@/assets/products/calca-alfaiataria.jpg";
import vestidoImage from "@/assets/products/vestido-linho.jpg";
import { analyzePhoto, type PhotoAnalysis } from "@/lib/provador.functions";
import {
  MAX_UPLOAD_BYTES,
  fileToPreviewURL,
  fileToSizedDataURL,
  isProbablyImage,
} from "@/lib/image-utils";

export type PhotoResult = {
  analysis: PhotoAnalysis;
  photoDataUrl: string;
  previewUrl: string;
};

export function PhotoStep({ onDone }: { onDone: (result: PhotoResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function run(file: File) {
    setError(null);
    if (!isProbablyImage(file)) {
      setError("Esse arquivo não é uma imagem.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("A imagem é muito grande. Envie uma foto de até 12 MB.");
      return;
    }
    setBusy(true);
    try {
      const [photoDataUrl, previewUrl] = await Promise.all([
        fileToSizedDataURL(file),
        fileToPreviewURL(file),
      ]);
      setPreview(previewUrl);
      const analysis = await analyzePhoto({ data: { imageDataUrl: photoDataUrl } });
      onDone({ analysis, photoDataUrl, previewUrl });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não conseguimos analisar essa foto. Tente outra.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function useExample() {
    setError(null);
    setBusy(true);
    try {
      const blob = await (await fetch(modeloImage)).blob();
      await run(new File([blob], "modelo.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      setError("Não conseguimos carregar a foto de exemplo.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <Panel className="paper-grain p-6 sm:p-8">
        <Eyebrow>Passo 1</Eyebrow>
        <h2 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
          Envie uma foto de corpo inteiro
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-secondary-foreground">
          De frente, em pé, com o corpo todo visível. A partir dela estimamos suas medidas — e você
          revisa tudo no passo seguinte antes de ver as recomendações.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void run(file);
          }}
          className={`mt-6 rounded-xl border border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-line bg-background"
          }`}
        >
          {preview ? (
            <img
              src={preview}
              alt="Pré-visualização da foto enviada"
              className="mx-auto max-h-80 rounded-lg object-contain"
            />
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              Arraste a foto aqui ou escolha um arquivo
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void run(file);
              event.target.value = "";
            }}
          />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "Analisando…" : "Escolher foto"}
            </Button>
            <Button variant="outline" onClick={() => void useExample()} disabled={busy}>
              Usar foto de exemplo
            </Button>
          </div>
        </div>

        {busy ? (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            lendo proporções…
          </p>
        ) : null}
        {error ? <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div> : null}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          A foto é usada só para gerar sua estimativa e a prova visual desta sessão. Nada é salvo em
          servidor.
        </p>
      </Panel>

      <div className="space-y-4">
        <Eyebrow>No provador hoje</Eyebrow>
        <div className="grid grid-cols-3 gap-3">
          {[camisaImage, calcaImage, vestidoImage].map((src) => (
            <div key={src} className="overflow-hidden rounded-lg border border-line bg-card">
              <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
            </div>
          ))}
        </div>
        <ul className="space-y-2 text-sm text-secondary-foreground">
          <li className="border-l-2 border-primary/40 pl-3">
            Tamanho calculado peça a peça, pela tabela de medidas.
          </li>
          <li className="border-l-2 border-primary/40 pl-3">
            Recomendações por estilo, ocasião, cor e orçamento.
          </li>
          <li className="border-l-2 border-primary/40 pl-3">
            Prova visual da peça no seu corpo, gerada na hora.
          </li>
        </ul>
      </div>
    </div>
  );
}
