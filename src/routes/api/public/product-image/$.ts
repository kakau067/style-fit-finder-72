import { createFileRoute } from "@tanstack/react-router";

import { PRODUCT_IMAGE_BUCKET } from "@/lib/products.shared";

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * Serves product photos from the private bucket. Only simple `folder/file.ext`
 * paths are accepted — no traversal, no query influence.
 */
export const Route = createFileRoute("/api/public/product-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params._splat ?? "";
        if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-zA-Z0-9]+$/.test(raw) || raw.includes("..")) {
          return new Response("Caminho inválido", { status: 400 });
        }
        const ext = raw.split(".").pop()?.toLowerCase() ?? "";
        const contentType = CONTENT_TYPE[ext];
        if (!contentType) return new Response("Formato não suportado", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .download(raw);
        if (error || !data) return new Response("Imagem não encontrada", { status: 404 });

        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
