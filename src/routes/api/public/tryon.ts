import { createFileRoute } from "@tanstack/react-router";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";

import { PRODUCT_BY_ID, type Product } from "@/data/catalog";
import type { Database } from "@/integrations/supabase/types";
import { garmentFileFromReference } from "@/lib/image-gateway.server";
import { rowToProduct } from "@/lib/products.shared";
import { SIZES, type FitPref, type Size } from "@/lib/sizing";

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

function garmentType(product: Product): "upper_body" | "lower_body" | "dress" {
  const keys = Object.keys(product.fit.ease);
  if (keys.includes("inseam")) return "lower_body";
  if (keys.includes("hips")) return "dress";
  return "upper_body";
}

async function dataUrlFromFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
}

export const Route = createFileRoute("/api/public/tryon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["FAL_KEY"];
        if (!apiKey) return new Response("Serviço de prova visual indisponível", { status: 500 });

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
          fal.config({ credentials: apiKey });
          const [humanImageUrl, garmentImageUrl] = await Promise.all([
            dataUrlFromFile(photo),
            dataUrlFromFile(garment),
          ]);
          const result = await fal.subscribe("fal-ai/idm-vton", {
            input: {
              human_image_url: humanImageUrl,
              garment_image_url: garmentImageUrl,
              garment_type: garmentType(product),
              description: `${product.name}, ${product.colorName}, ${product.fabric}. ${product.silhouette}. Tamanho ${size}, caimento ${FIT_WORDING[fitPref]}.`,
              num_inference_steps: 30,
            },
          });
          const imageUrl = result.data?.image?.url;
          if (!imageUrl) throw new Error("O Fal.ai não retornou uma imagem de prova.");
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) throw new Error("Não foi possível carregar a imagem gerada.");
          const imageFile = new File([await imageResponse.arrayBuffer()], "tryon.png", { type: imageResponse.headers.get("content-type") ?? "image/png" });
          const imageDataUrl = await dataUrlFromFile(imageFile);
          const [, base64 = ""] = imageDataUrl.split(",");
          const payload = JSON.stringify({ type: "image_edit.completed", b64_json: base64 });
          return new Response(`event: image_edit.completed\ndata: ${payload}\n\n`, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Falha na prova visual.", { status: 502 });
        }
      },
    },
  },
});
