/**
 * Demo catalogue — the stand-in for a real store connection.
 *
 * Every garment carries its own measurement chart in centimetres, the way a
 * real size guide would, plus the ease the cut is designed around. That is the
 * only thing the sizing engine needs, so swapping this file for a Shopify or
 * WooCommerce feed is a data-mapping job, not a logic change.
 */

import type { BodyShape, ProductFit, SizeSpec } from "@/lib/sizing";

import blazerImage from "@/assets/products/blazer.jpg";
import calcaImage from "@/assets/products/calca-alfaiataria.jpg";
import camisaImage from "@/assets/products/camisa-viscose.jpg";
import camisetaImage from "@/assets/products/camiseta-pima.jpg";
import jaquetaImage from "@/assets/products/jaqueta-jeans.jpg";
import saiaImage from "@/assets/products/saia-plissada.jpg";
import tricotImage from "@/assets/products/tricot.jpg";
import vestidoImage from "@/assets/products/vestido-linho.jpg";

export type Audience = "feminino" | "masculino" | "unissex";

export type Product = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  audience: Audience;
  image: string;
  images: { front: string; back: string; detail: string };
  storeUrl: string;
  colorName: string;
  colorHex: string;
  fabric: string;
  silhouette: string;
  styles: string[];
  occasions: string[];
  flatters: BodyShape[];
  fit: ProductFit;
  sizes: SizeSpec[];
};

const s = (
  size: SizeSpec["size"],
  stock: boolean,
  measurements: SizeSpec["measurements"],
): SizeSpec => ({ size, stock, measurements });

export const STYLE_TAGS = [
  "basico",
  "minimalista",
  "alfaiataria",
  "descontraido",
  "romantico",
  "streetwear",
  "festa",
] as const;

export const OCCASIONS = [
  "dia-a-dia",
  "trabalho",
  "encontro",
  "festa",
  "praia",
  "viagem",
] as const;

export const STYLE_LABEL: Record<string, string> = {
  basico: "básico",
  minimalista: "minimalista",
  alfaiataria: "alfaiataria",
  descontraido: "descontraído",
  romantico: "romântico",
  streetwear: "streetwear",
  festa: "festa",
};

export const OCCASION_LABEL: Record<string, string> = {
  "dia-a-dia": "dia a dia",
  trabalho: "trabalho",
  encontro: "encontro",
  festa: "festa",
  praia: "praia",
  viagem: "viagem",
};

export const PRODUCTS: Product[] = [
  {
    id: "camiseta-pima",
    name: "Camiseta Pima Essencial",
    tagline: "Algodão pima peruano, costura reforçada, cai reto no corpo.",
    price: 129,
    audience: "unissex",
    image: camisetaImage,
    images: { front: camisetaImage, back: camisetaImage, detail: camisetaImage },
    storeUrl: "",
    colorName: "cru",
    colorHex: "#EFE7D8",
    fabric: "Algodão pima 100%",
    silhouette: "Modelagem reta que não marca a cintura.",
    styles: ["basico", "minimalista", "descontraido"],
    occasions: ["dia-a-dia", "praia", "viagem"],
    flatters: ["ampulheta", "triangle", "retangulo", "oval"],
    fit: {
      stretch: 0.15,
      ease: { chest: 8, waist: 6, shoulder: 1.5 },
      weight: { chest: 0.55, waist: 0.2, shoulder: 0.25 },
      tolerance: { chest: 5, waist: 5, shoulder: 1.6 },
    },
    sizes: [
      s("PP", false, { chest: 92, waist: 88, shoulder: 40 }),
      s("P", true, { chest: 98, waist: 94, shoulder: 42 }),
      s("M", true, { chest: 104, waist: 100, shoulder: 44 }),
      s("G", true, { chest: 112, waist: 108, shoulder: 46 }),
      s("GG", true, { chest: 120, waist: 116, shoulder: 48 }),
    ],
  },
  {
    id: "camisa-viscose",
    name: "Camisa Fluida Oversized",
    tagline: "Viscose certified com caimento leve e ombro deslocado.",
    price: 249,
    audience: "unissex",
    image: camisaImage,
    images: { front: camisaImage, back: camisaImage, detail: camisaImage },
    storeUrl: "",
    colorName: "verde sálvia",
    colorHex: "#9BAA8E",
    fabric: "Viscose de eucalipto",
    silhouette: "Ombro caído e barra longa alongam a silhueta.",
    styles: ["minimalista", "descontraido", "romantico"],
    occasions: ["dia-a-dia", "trabalho", "viagem", "encontro"],
    flatters: ["inverted", "retangulo", "oval", "ampulheta"],
    fit: {
      stretch: 0.05,
      ease: { chest: 16, waist: 16, shoulder: 5 },
      weight: { chest: 0.6, waist: 0.15, shoulder: 0.25 },
      tolerance: { chest: 7, waist: 8, shoulder: 2.5 },
    },
    sizes: [
      s("PP", true, { chest: 104, waist: 98, shoulder: 43 }),
      s("P", true, { chest: 110, waist: 104, shoulder: 45 }),
      s("M", true, { chest: 116, waist: 110, shoulder: 47 }),
      s("G", true, { chest: 122, waist: 116, shoulder: 49 }),
      s("GG", true, { chest: 128, waist: 122, shoulder: 51 }),
    ],
  },
  {
    id: "calca-alfaiataria",
    name: "Calça Alfaiataria Cintura Alta",
    tagline: "Pregas fundas, cintura que não abre e perna wide leg.",
    price: 389,
    audience: "unissex",
    image: calcaImage,
    images: { front: calcaImage, back: calcaImage, detail: calcaImage },
    storeUrl: "",
    colorName: "caramelo",
    colorHex: "#C08B54",
    fabric: "Lã fria com elastano",
    silhouette: "Cintura alta e barra ampla criam linha contínua.",
    styles: ["alfaiataria", "minimalista", "festa"],
    occasions: ["trabalho", "encontro", "festa", "dia-a-dia"],
    flatters: ["ampulheta", "inverted", "retangulo", "oval"],
    fit: {
      stretch: 0.08,
      ease: { waist: 2, hips: 6, inseam: 0 },
      weight: { waist: 0.42, hips: 0.4, inseam: 0.18 },
      tolerance: { waist: 2.5, hips: 4, inseam: 3 },
    },
    sizes: [
      s("PP", true, { waist: 62, hips: 90, inseam: 70 }),
      s("P", true, { waist: 67, hips: 95, inseam: 72 }),
      s("M", true, { waist: 72, hips: 100, inseam: 73 }),
      s("G", true, { waist: 78, hips: 106, inseam: 75 }),
      s("GG", true, { waist: 84, hips: 112, inseam: 76 }),
    ],
  },
  {
    id: "vestido-linho",
    name: "Vestido Midi de Linho",
    tagline: "Linho lavado com cinto para amarrar e saia evasê.",
    price: 459,
    audience: "feminino",
    image: vestidoImage,
    images: { front: vestidoImage, back: vestidoImage, detail: vestidoImage },
    storeUrl: "",
    colorName: "terracota",
    colorHex: "#B4614A",
    fabric: "Linho europeu",
    silhouette: "Saia evasê que afasta do quadril sem volume.",
    styles: ["romantico", "descontraido"],
    occasions: ["praia", "encontro", "viagem", "festa"],
    flatters: ["triangle", "inverted", "ampulheta", "oval"],
    fit: {
      stretch: 0.03,
      ease: { chest: 8, waist: 6, hips: 8 },
      weight: { chest: 0.4, waist: 0.3, hips: 0.3 },
      tolerance: { chest: 5, waist: 4, hips: 5 },
    },
    sizes: [
      s("PP", true, { chest: 88, waist: 74, hips: 96 }),
      s("P", true, { chest: 94, waist: 80, hips: 102 }),
      s("M", true, { chest: 100, waist: 86, hips: 108 }),
      s("G", true, { chest: 108, waist: 92, hips: 114 }),
      s("GG", false, { chest: 116, waist: 100, hips: 122 }),
    ],
  },
  {
    id: "blazer",
    name: "Blazer Desestruturado",
    tagline: "Sem ombreiras, forro parcial, veste como um casaco leve.",
    price: 649,
    audience: "unissex",
    image: blazerImage,
    images: { front: blazerImage, back: blazerImage, detail: blazerImage },
    storeUrl: "",
    colorName: "grafite",
    colorHex: "#3A3A3C",
    fabric: "Lã fria com viscose",
    silhouette: "Lapela longa afina o tronco e desvia do volume.",
    styles: ["alfaiataria", "minimalista", "festa"],
    occasions: ["trabalho", "festa", "encontro"],
    flatters: ["triangle", "retangulo", "ampulheta"],
    fit: {
      stretch: 0.04,
      ease: { chest: 12, waist: 10, shoulder: 2.5 },
      weight: { chest: 0.5, shoulder: 0.3, waist: 0.2 },
      tolerance: { chest: 5, shoulder: 1.8, waist: 5 },
    },
    sizes: [
      s("PP", true, { chest: 100, waist: 94, shoulder: 41 }),
      s("P", true, { chest: 106, waist: 100, shoulder: 42.5 }),
      s("M", true, { chest: 112, waist: 106, shoulder: 44 }),
      s("G", true, { chest: 118, waist: 112, shoulder: 45.5 }),
      s("GG", false, { chest: 126, waist: 120, shoulder: 47.5 }),
    ],
  },
  {
    id: "saia-plissada",
    name: "Saia Midi Plissada",
    tagline: "Pala de elástico embutido e plissado que não abre.",
    price: 329,
    audience: "feminino",
    image: saiaImage,
    images: { front: saiaImage, back: saiaImage, detail: saiaImage },
    storeUrl: "",
    colorName: "rosé queimado",
    colorHex: "#C08C88",
    fabric: "Georgette plissada",
    silhouette: "Plissado vertical que desce reto sobre o quadril.",
    styles: ["romantico", "minimalista", "festa"],
    occasions: ["festa", "encontro", "trabalho"],
    flatters: ["inverted", "triangle", "retangulo", "ampulheta"],
    fit: {
      stretch: 0.12,
      ease: { waist: 2, hips: 6 },
      weight: { waist: 0.55, hips: 0.45 },
      tolerance: { waist: 2.5, hips: 4 },
    },
    sizes: [
      s("PP", true, { waist: 60, hips: 88 }),
      s("P", true, { waist: 65, hips: 93 }),
      s("M", true, { waist: 70, hips: 98 }),
      s("G", true, { waist: 76, hips: 104 }),
      s("GG", true, { waist: 82, hips: 110 }),
    ],
  },
  {
    id: "tricot",
    name: "Tricot Canelado Gola Alta",
    tagline: "Canelado de toque macio com elasticidade real.",
    price: 379,
    audience: "unissex",
    image: tricotImage,
    images: { front: tricotImage, back: tricotImage, detail: tricotImage },
    storeUrl: "",
    colorName: "verde oliva",
    colorHex: "#5E6B4A",
    fabric: "Malha canelada de viscose e elastano",
    silhouette: "Acompanha o corpo sem colar, com gola que alonga.",
    styles: ["basico", "minimalista", "descontraido"],
    occasions: ["dia-a-dia", "viagem", "encontro"],
    flatters: ["ampulheta", "retangulo", "inverted"],
    fit: {
      stretch: 0.35,
      ease: { chest: 4, waist: 8, shoulder: 1 },
      weight: { chest: 0.55, waist: 0.2, shoulder: 0.25 },
      tolerance: { chest: 5, waist: 6, shoulder: 1.6 },
    },
    sizes: [
      s("PP", true, { chest: 84, waist: 78, shoulder: 38 }),
      s("P", true, { chest: 90, waist: 84, shoulder: 40 }),
      s("M", true, { chest: 96, waist: 90, shoulder: 42 }),
      s("G", true, { chest: 102, waist: 96, shoulder: 44 }),
      s("GG", true, { chest: 110, waist: 104, shoulder: 46 }),
    ],
  },
  {
    id: "jaqueta-jeans",
    name: "Jaqueta Jeans Cropped",
    tagline: "Barra curta, lavagem média e estrutura que segura a forma.",
    price: 429,
    audience: "unissex",
    image: jaquetaImage,
    images: { front: jaquetaImage, back: jaquetaImage, detail: jaquetaImage },
    storeUrl: "",
    colorName: "índigo",
    colorHex: "#4A6584",
    fabric: "Denim 100% algodão",
    silhouette: "Cropped que marca a cintura e amplia a perna.",
    styles: ["streetwear", "descontraido", "basico"],
    occasions: ["dia-a-dia", "festa", "viagem"],
    flatters: ["retangulo", "inverted", "ampulheta"],
    fit: {
      stretch: 0.02,
      ease: { chest: 10, waist: 8, shoulder: 2 },
      weight: { chest: 0.5, shoulder: 0.3, waist: 0.2 },
      tolerance: { chest: 5, shoulder: 1.8, waist: 5 },
    },
    sizes: [
      s("PP", true, { chest: 94, waist: 86, shoulder: 41 }),
      s("P", true, { chest: 100, waist: 92, shoulder: 42.5 }),
      s("M", true, { chest: 106, waist: 98, shoulder: 44 }),
      s("G", true, { chest: 112, waist: 104, shoulder: 45.5 }),
      s("GG", true, { chest: 120, waist: 112, shoulder: 47.5 }),
    ],
  },
];

export const PRODUCT_BY_ID = new Map(PRODUCTS.map((product) => [product.id, product]));

export function audienceMatches(product: Product, audience: "feminino" | "masculino") {
  return product.audience === "unissex" || product.audience === audience;
}
