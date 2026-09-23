import { useEffect, useRef, useState } from "react";

import { Button, ErrorNote } from "@/components/provador/primitives";

export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1706 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        setError(
          "Não conseguimos abrir a câmera. Autorize o acesso no navegador ou escolha um arquivo.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) {
      setError("Não conseguimos capturar a imagem. Tente de novo.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Não conseguimos capturar a imagem. Tente de novo.");
          return;
        }
        onCapture(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-serif text-2xl text-foreground">Tirar foto</h3>
        <p className="mt-1 text-sm text-secondary-foreground">
          Fique de frente, em pé, com o corpo todo no enquadramento.
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-background">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[3/4] w-full scale-x-[-1] object-cover"
          />
        </div>

        {error ? <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={shoot} disabled={!ready || Boolean(error)}>
            Capturar
          </Button>
        </div>
      </div>
    </div>
  );
}
