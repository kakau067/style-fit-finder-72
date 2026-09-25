import { garmentTypeOf, type Product } from "@/data/catalog";

export type TryOnRegion = { x: number; y: number; width: number; height: number };

export function garmentRegion(product: Product): TryOnRegion {
  switch (garmentTypeOf(product)) {
    case "top": return { x: 0.1, y: 0.18, width: 0.8, height: 0.42 };
    case "pants": return { x: 0.1, y: 0.42, width: 0.8, height: 0.57 };
    case "skirt": return { x: 0.1, y: 0.42, width: 0.8, height: 0.43 };
    case "dress": return { x: 0.08, y: 0.17, width: 0.84, height: 0.73 };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível comparar as imagens."));
    image.src = src;
  });
}

/**
 * Normalizes the generated try-on to the original photo dimensions.
 *
 * The AI providers already receive strict instructions to preserve identity,
 * pose, background and every pixel outside the garment. Re-applying the result
 * through a fixed rectangular mask here cuts sleeves, hems and dress contours
 * and is especially wrong for loose garments. Keep the provider's complete
 * photorealistic result instead, while matching the original canvas so the
 * before/after slider stays perfectly aligned.
 */
export async function compositeTryOn(original: string, generated: string, _region: TryOnRegion) {
  const [before, after] = await Promise.all([loadImage(original), loadImage(generated)]);
  const width = before.naturalWidth;
  const height = before.naturalHeight;
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const context = result.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a prova visual.");

  context.drawImage(after, 0, 0, width, height);
  return result.toDataURL("image/jpeg", 0.94);
}
