import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { PRODUCT_BY_ID, garmentTypeOf, type Product } from "@/data/catalog";
import type { Database } from "@/integrations/supabase/types";
import { editImage, garmentFileFromReference, imageSettings } from "@/lib/image-gateway.server";
import { pollFalTryOn, submitFalTryOn, validTryOnRequest } from "@/lib/fal-tryon.server";
import { rowToProduct } from "@/lib/products.shared";
import { SIZES, type FitPref } from "@/lib/sizing";

async function findProduct(id: string): Promise<Product | null> {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (key && url) {
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data } = await client.from("products").select("*").eq("slug", id).maybeSingle();
    if (data) return rowToProduct(data);
  }
  return PRODUCT_BY_ID.get(id) ?? null;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const FIT_WORDING: Record<FitPref, string> = {
  justo: "justo ao corpo, sem repuxar",
  acertado: "acertado, acompanhando o corpo sem apertar",
  solto: "solto e confortável, com folga visível",
};

async function dataUrlFromFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
}

function streamGatewayTryOn(key: string, edit: FormData): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
      let closed = false;
      const emit = (chunk: Uint8Array) => { if (!closed) { try { controller.enqueue(chunk); } catch { closed = true; } } };
      const keepAlive = setInterval(() => emit(encoder.encode(": aguardando a imagem\n\n")), 10_000);
      const failure = (message: string) => emit(encoder.encode(
        `event: error\ndata: ${JSON.stringify({ type: "error", error: { message } })}\n\n`,
      ));
      try {
        emit(encoder.encode(": prova iniciada\n\n"));
        const upstream = await editImage({ ...imageSettings, apiKey: key }, edit, AbortSignal.timeout(180_000));
        if (!upstream.ok) {
          failure(`Serviço de prova visual respondeu ${upstream.status}: ${(await upstream.text().catch(() => "")).slice(0, 250)}`);
        } else if (upstream.headers.get("content-type")?.includes("text/event-stream") && upstream.body) {
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            emit(value);
          }
        } else {
          const result = (await upstream.json()) as { data?: Array<{ b64_json?: string }> };
          const base64 = result.data?.[0]?.b64_json;
          if (!base64) throw new Error("O serviço não retornou uma imagem de prova.");
          emit(encoder.encode(`event: image_edit.completed\ndata: ${JSON.stringify({ type: "image_edit.completed", b64_json: base64 })}\n\n`));
        }
      } catch (cause) {
        failure(cause instanceof Error ? cause.message : "A geração foi interrompida.");
      } finally {
        clearInterval(keepAlive);
        if (!closed) controller.close();
      }
      })();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

export const Route = createFileRoute("/api/public/tryon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env["FAL_KEY"];
        const params = new URL(request.url).searchParams;
        if (params.has("health")) return Response.json({ provider: key ? "fal_queue" : process.env["LOVABLE_API_KEY"] ? "lovable_stream" : "none" });
        const id = params.get("requestId") ?? "";
        const ticket = params.get("ticket") ?? "";
        const model = params.get("model") === "fashn" ? "fashn" : "idm";
        if (!key || !validTryOnRequest(id, ticket, key, model)) return new Response("Prova não encontrada", { status: 404 });
        try {
          return Response.json(await pollFalTryOn(key, id, model), { headers: { "Cache-Control": "no-store" } });
        } catch (cause) {
          return new Response(cause instanceof Error ? cause.message : "Falha ao acompanhar a prova.", { status: 502 });
        }
      },
      POST: async ({ request }) => {
        const apiKey = process.env["FAL_KEY"];
        const gatewayKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey && !gatewayKey) return new Response("Prova visual indisponível: configure FAL_KEY ou LOVABLE_API_KEY no servidor.", { status: 503 });

        const form = await request.formData().catch(() => null);
        if (!form) return new Response("Requisição inválida", { status: 400 });
        const photo = form.get("photo");
        const productId = form.get("product");
        const size = form.get("size");
        const fitPref = form.get("fitPref");

        if (!(photo instanceof File) || photo.size === 0) return new Response("Foto do cliente é obrigatória", { status: 400 });
        if (!photo.type.startsWith("image/")) return new Response("O arquivo enviado não é uma imagem", { status: 400 });
        if (photo.size > MAX_PHOTO_BYTES) return new Response("Foto muito grande", { status: 413 });
        if (typeof productId !== "string") return new Response("Peça não informada", { status: 400 });

        const product = await findProduct(productId);
        if (!product) return new Response("Peça desconhecida", { status: 404 });
        if (typeof size !== "string" || !(SIZES as readonly string[]).includes(size)) return new Response("Tamanho inválido", { status: 400 });
        if (fitPref !== "justo" && fitPref !== "acertado" && fitPref !== "solto") return new Response("Preferência de caimento inválida", { status: 400 });

        try {
          const garment = await garmentFileFromReference(product.images.front, new URL(request.url).origin);
          if (apiKey) {
            const [humanImageUrl, garmentImageUrl] = await Promise.all([
              dataUrlFromFile(photo), dataUrlFromFile(garment),
            ]);
            const type = garmentTypeOf(product);
            const queued = await submitFalTryOn(apiKey, {
              model_image: humanImageUrl,
              garment_image: garmentImageUrl,
              category: type === "dress" ? "one-pieces" : type === "top" ? "tops" : "bottoms",
              mode: "balanced",
              garment_photo_type: "auto",
              output_format: "png",
            });
            return Response.json({ provider: "fal_queue", ...queued }, { status: 202, headers: { "Cache-Control": "no-store" } });
          } else {
            const edit = new FormData();
            edit.set("image[]", photo);
            edit.append("image[]", garment);
            edit.set("stream", "true");
            const scope = {
              top: "Substitua apenas a roupa da parte de cima; preserve a calça ou saia e os sapatos.",
              pants: "Substitua apenas a calça, da cintura à barra; preserve a blusa, rosto e sapatos.",
              skirt: "Substitua apenas a peça da cintura até a barra por uma saia; preserve a blusa, pernas e sapatos.",
              dress: "Vista um vestido inteiro, do ombro à barra, cobrindo a blusa e a calça originais; preserve rosto e sapatos.",
            }[garmentTypeOf(product)];
            edit.set("prompt", `${scope} Use a segunda imagem como referência fiel da peça: ${product.name}, ${product.colorName}, ${product.fabric}. Preserve exatamente rosto, cabelo, pose, corpo e fundo fora da peça. Caimento ${FIT_WORDING[fitPref]}.`);
            return streamGatewayTryOn(gatewayKey!, edit);
          }
        } catch (error) {
          const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
          return new Response(timeout ? "A geração demorou além do limite. Tente novamente em instantes." : error instanceof Error ? error.message : "Falha na prova visual.", { status: timeout ? 504 : 502 });
        }
      },
    },
  },
});
