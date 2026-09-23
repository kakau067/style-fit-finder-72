/**
 * Shared (client-safe) helpers to map a products table row into the Product
 * shape the sizing engine and the UI already understand.
 */

import type { Product } from "@/data/catalog";
import type { Database } from "@/integrations/supabase/types";
import type { BodyShape, ProductFit, SizeSpec } from "@/lib/sizing";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Images live in a private bucket; the app serves them through this route. */
export function productImageUrl(imagePath: string): string {
  const safe = imagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/public/product-image/${safe}`;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.slug,
    name: row.name,
    tagline: row.tagline,
    price: Number(row.price),
    audience: row.audience as Product["audience"],
    image: productImageUrl(row.image_front_path ?? row.image_path),
    images: {
      front: productImageUrl(row.image_front_path ?? row.image_path),
      back: productImageUrl(row.image_back_path ?? row.image_path),
      detail: productImageUrl(row.image_detail_path ?? row.image_path),
    },
    storeUrl: row.store_url ?? "",
    colorName: row.color_name,
    colorHex: row.color_hex,
    fabric: row.fabric,
    silhouette: row.silhouette,
    styles: row.styles,
    occasions: row.occasions,
    flatters: row.flatters as BodyShape[],
    fit: row.fit as unknown as ProductFit,
    sizes: row.sizes as unknown as SizeSpec[],
  };
}
