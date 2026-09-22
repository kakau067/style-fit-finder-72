import { createFileRoute } from "@tanstack/react-router";

import { PRODUCT_BY_ID } from "@/data/catalog";
import { editImage, garmentFileFromReference, imageSettings } from "@/lib/image-gateway.server";
import { SIZES, type FitPref, type Size } from "@/lib/sizing";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const FIT_WORDING: Record<FitPref, string> = {
  justo: "justo ao corpo, sem repuxar",
  acertado: "acertado, acompanhando o corpo sem apertar",
  solto: "solto e confortável, com folga visível",
};

function buildPrompt(input: {
  name: string;
  colorName: string;
  fabric: string;
  silhouette: string;
  size: Size;
  fitPref: FitPref;
}) {
  return [
    `Reference image 1 is the customer. Keep her identity exactly as it is: same face, hair, skin tone, body proportions, standing pose, and the same camera angle and framing.`,
    `Reference image 2 is the garment to try on: the "${input.name}" in ${input.colorName} (${input.fabric}). ${input.silhouette}`,
    `Dress the customer from image 1 in that garment, in size ${input.size}, cut ${FIT_WORDING[input.fitPref]}. Replace the clothing she is currently wearing with it and make the fabric fall with correct weight, wrinkles and scale for her body.`,
    `Keep the background, the floor and the lighting identical to image 1. Full-body lookbook photograph, realistic fabric texture and shadows. No text, no logo, no watermark, no split screen.`,
  ].join(" ");
}

export const Route = createFileRoute("/api/public/tryon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Serviço de prova visual indisponível", { status: 500 });

        const form = await request.formData().catch(() => null);
        if (!form) return new Response("Requisição inválida", { status: 400 });

        const photo = form.get("photo");
        const productId = form.get("product");
        const size = form.get("size");
        const fitPref = form.get("fitPref");

        if (!(photo instanceof File) || photo.size === 0) {
          return new Response("Foto do cliente é obrigatória", { status: 400 });
        }
        if (!photo.type.startsWith("image/")) {
          return new Response("O arquivo enviado não é uma imagem", { status: 400 });
        }
        if (photo.size > MAX_PHOTO_BYTES) {
          return new Response("Foto muito grande", { status: 413 });
        }
        if (typeof productId !== "string") {
          return new Response("Peça não informada", { status: 400 });
        }
        const product = PRODUCT_BY_ID.get(productId);
        if (!product) return new Response("Peça desconhecida", { status: 404 });
        if (typeof size !== "string" || !(SIZES as readonly string[]).includes(size)) {
          return new Response("Tamanho inválido", { status: 400 });
        }
        if (fitPref !== "justo" && fitPref !== "acertado" && fitPref !== "solto") {
          return new Response("Preferência de caimento inválida", { status: 400 });
        }

        let garment: File;
        try {
          garment = await garmentFileFromReference(product.image, new URL(request.url).origin);
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Falha ao carregar a peça", {
            status: 502,
          });
        }

        const upstreamForm = new FormData();
        upstreamForm.append(
          "prompt",
          buildPrompt({
            name: product.name,
            colorName: product.colorName,
            fabric: product.fabric,
            silhouette: product.silhouette,
            size: size as Size,
            fitPref: fitPref as FitPref,
          }),
        );
        // Order matters: the prompt names image 1 as the person, image 2 as the garment.
        upstreamForm.append("image[]", photo, "cliente.jpg");
        upstreamForm.append("image[]", garment, "peca.jpg");
        upstreamForm.set("size", "1024x1536");
        upstreamForm.set("quality", "medium");
        const stream = form.get("stream");
        if (typeof stream === "string") upstreamForm.set("stream", stream);

        const upstream = await editImage({ ...imageSettings, apiKey }, upstreamForm);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
