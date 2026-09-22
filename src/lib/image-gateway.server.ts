/**
 * Server-only image gateway configuration and requests for the try-on flow.
 *
 * The try-on is an *edit*: two reference images (the person, then the garment)
 * go to the gateway as multipart, and the SSE body is forwarded to the browser
 * untouched so previews render progressively.
 */

export type ImageConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  format: "openai" | "gemini-chat" | "generate-content";
};

export const imageSettings: Omit<ImageConfig, "apiKey"> = {
  baseURL: "https://ai.gateway.lovable.dev",
  model: "openai/gpt-image-2.5-sunburst",
  format: "openai",
};

export async function editImage(
  config: ImageConfig,
  form: FormData,
  signal?: AbortSignal,
): Promise<Response> {
  const streaming = form.get("stream") !== "false";

  if (config.format === "openai") {
    form.set("model", config.model);
    if (streaming) {
      form.set("stream", "true");
      if (!form.has("partial_images")) form.set("partial_images", "1");
    } else {
      form.delete("stream");
      form.delete("partial_images");
    }
    return fetch(`${config.baseURL}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: signal ?? null,
    });
  }

  const prompt = form.get("prompt");
  const images = [...form.entries()]
    .filter(([name, value]) => (name === "image" || name === "image[]") && value instanceof File)
    .map(([, value]) => value as File);
  if (typeof prompt !== "string" || !prompt.trim() || images.length === 0) {
    return new Response("An image and edit instruction are required", { status: 400 });
  }

  const imageParts = await Promise.all(
    images.map(async (image) => {
      const bytes = new Uint8Array(await image.arrayBuffer());
      const data = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
      return config.format === "generate-content"
        ? { inlineData: { mimeType: image.type, data } }
        : { type: "image_url", image_url: { url: `data:${image.type};base64,${data}` } };
    }),
  );

  const input =
    config.format === "generate-content"
      ? {
          contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }
      : {
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageParts] }],
          modalities: ["image", "text"],
        };

  return fetch(`${config.baseURL}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, ...input, ...(streaming ? { stream: true } : {}) }),
    signal: signal ?? null,
  });
}

/**
 * Turns the garment reference the browser sends into a File the gateway can
 * read. Only same-origin asset paths and data URLs are accepted, so this route
 * can never be pointed at an arbitrary host.
 */
export async function garmentFileFromReference(reference: string): Promise<File> {
  if (reference.startsWith("data:image/")) {
    const [meta, base64] = reference.split(",");
    const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], "garment", { type: mime });
  }

  const isRelativeAsset = reference.startsWith("/") && !reference.startsWith("//");
  if (!isRelativeAsset) {
    throw new Error("Referência de peça inválida.");
  }

  const asset = await fetch(`https://placeholder.invalid${reference}`.replace("https://placeholder.invalid", ""), {
    cache: "force-cache",
  }).catch(() => null);
  if (!asset || !asset.ok) throw new Error("Não foi possível carregar a imagem da peça.");

  const blob = await asset.blob();
  return new File([blob], "garment", { type: blob.type || "image/jpeg" });
}
