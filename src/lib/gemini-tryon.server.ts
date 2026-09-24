import { garmentTypeOf, type Product } from "@/data/catalog";
import type { FitPref } from "@/lib/sizing";

type RenderMode = "fast" | "balanced" | "quality";

const MAX_INPUT_BYTES = 13 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;

export function geminiTryOnPrompt(product: Product, fitPref: FitPref): string {
  const garment = garmentTypeOf(product);
  const target = {
    top: "Change ONLY the upper body garment (shirt, jacket or sweater). Keep the original trousers or skirt, shoes and accessories.",
    pants: "Change ONLY the trousers, from waistband to ankles. Keep the original upper garment, shoes and accessories.",
    skirt: "Change ONLY the lower garment from waist to hem into the reference skirt. Keep the original upper garment, visible legs and shoes.",
    dress: "Dress the person in the complete reference dress, covering the original shirt and trousers from shoulders to the dress hem. Keep their original head, arms, visible legs and shoes.",
  }[garment];

  return [
    "Create ONE photorealistic full-body virtual try-on photograph using the two reference images that follow.",
    "Image 1 is the person and the composition to preserve. Image 2 is the exact garment to wear, not a person to copy.",
    target,
    `The garment is ${product.name}; keep its actual colour (${product.colorName}), silhouette, neckline, sleeve length, hem, print and fabric appearance shown in image 2.`,
    "Keep the exact identity, facial features, hairstyle, body proportions, pose, hands, lighting, camera angle and background of image 1.",
    "Replace only the garment's region and blend realistic folds, seams and shadows. Do not change the body, remove limbs, add clothing items, alter the scene or invent logos.",
    `Aim for ${fitPref === "justo" ? "a close fit" : fitPref === "solto" ? "a relaxed fit" : "a natural regular fit"} without changing the person's measurements.`,
    "Return only the edited photograph, with the same full-body framing as image 1.",
  ].join(" ");
}

function encodedImage(file: File) {
  if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type)) {
    throw new Error("Envie imagens JPEG, PNG ou WebP para a prova com Gemini.");
  }
  return file.arrayBuffer().then((buffer) => ({ inlineData: { mimeType: file.type, data: Buffer.from(buffer).toString("base64") } }));
}

export async function generateGeminiTryOn(key: string, person: File, garment: File, product: Product, fitPref: FitPref, mode: RenderMode) {
  if (person.size + garment.size > MAX_INPUT_BYTES) {
    throw new Error("As duas imagens juntas são grandes demais. Envie fotos menores para a prova com Gemini.");
  }
  const [personPart, garmentPart] = await Promise.all([encodedImage(person), encodedImage(garment)]);
  const model = mode === "quality" ? "gemini-3.1-flash-image" : "gemini-2.5-flash-image";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: geminiTryOnPrompt(product, fitPref) }, personPart, garmentPart] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...(mode === "quality" ? { imageConfig: { imageSize: "2K" } } : {}),
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("O Gemini atingiu o limite de solicitações. Tente novamente em instantes.");
    if (response.status === 401 || response.status === 403) throw new Error("A chave Gemini não permite gerar imagens. Verifique a configuração do servidor.");
    throw new Error(`O Gemini não concluiu a prova (código ${response.status}).`);
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> };
  const image = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!image?.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length > MAX_OUTPUT_BYTES * 4 / 3 + 4) {
    throw new Error("O Gemini não retornou uma imagem de prova válida.");
  }
  const mime = image.mimeType?.toLowerCase();
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") throw new Error("O Gemini retornou um formato de imagem incompatível.");
  return `data:${mime};base64,${image.data}`;
}
