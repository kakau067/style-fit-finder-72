import type { Product } from "@/data/catalog";

export type TryOnRegion = { x: number; y: number; width: number; height: number };

export function garmentRegion(product: Product): TryOnRegion {
  const { chest, hips } = product.fit.weight;
  if (chest === undefined) return { x: 0.12, y: 0.42, width: 0.76, height: 0.55 };
  if (hips !== undefined) return { x: 0.12, y: 0.18, width: 0.76, height: 0.72 };
  return { x: 0.12, y: 0.2, width: 0.76, height: 0.39 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível comparar as imagens."));
    image.src = src;
  });
}

/** Copies the original pixels outside the selected garment area. */
export async function compositeTryOn(original: string, generated: string, region: TryOnRegion) {
  const [before, after] = await Promise.all([loadImage(original), loadImage(generated)]);
  const width = before.naturalWidth;
  const height = before.naturalHeight;
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const context = result.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a prova visual.");
  context.drawImage(before, 0, 0, width, height);

  const overlay = document.createElement("canvas");
  overlay.width = width;
  overlay.height = height;
  const layer = overlay.getContext("2d");
  if (!layer) throw new Error("Não foi possível preparar a prova visual.");
  // Both layers use the original dimensions, keeping the comparison aligned.
  layer.drawImage(after, 0, 0, width, height);
  layer.globalCompositeOperation = "destination-in";
  layer.filter = `blur(${Math.max(3, Math.round(width * 0.01))}px)`;
  layer.fillStyle = "#fff";
  layer.fillRect(region.x * width, region.y * height, region.width * width, region.height * height);
  layer.filter = "none";
  context.drawImage(overlay, 0, 0);
  return result.toDataURL("image/jpeg", 0.92);
}
