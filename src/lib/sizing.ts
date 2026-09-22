/**
 * Pure sizing engine — no I/O, no framework.
 *
 * Everything here is deterministic on purpose: the AI model only ever estimates
 * the *body*; the decision of which size a garment is stays in plain, auditable
 * arithmetic so a recommendation can always be explained (and fixed).
 */

export const SIZES = ["PP", "P", "M", "G", "GG"] as const;
export type Size = (typeof SIZES)[number];

export type Body = {
  heightCm: number;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderCm: number;
  inseamCm: number;
};

export type FitPref = "justo" | "acertado" | "solto";

export type GarmentKey = "chest" | "waist" | "hips" | "shoulder" | "inseam";

export type SizeSpec = {
  size: Size;
  stock: boolean;
  measurements: Partial<Record<GarmentKey, number>>;
};

export type ProductFit = {
  /** Extra cm of fabric left over the body when the cut is "acertado". */
  ease: Partial<Record<GarmentKey, number>>;
  /** How much each measurement decides the fit. Should sum to ~1. */
  weight: Partial<Record<GarmentKey, number>>;
  /** How many cm of deviation still count as "no problem". */
  tolerance: Partial<Record<GarmentKey, number>>;
  /** 0 = rigid woven, up to ~0.4 for a stretchy knit. */
  stretch: number;
};

export type SizeFitResult = {
  size: Size;
  stock: boolean;
  confidence: number;
  verdict: "apertado" | "ideal" | "amplo";
  ease: Partial<Record<GarmentKey, number>>;
  notes: string[];
};

const PREF_MULTIPLIER: Record<FitPref, number> = {
  justo: 0.6,
  acertado: 1,
  solto: 1.5,
};

const KEY_LABEL: Record<GarmentKey, string> = {
  chest: "busto",
  waist: "cintura",
  hips: "quadril",
  shoulder: "ombro",
  inseam: "comprimento da perna",
};

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Pick the size whose leftover fabric sits closest to what this cut is meant
 * to have, weighted by the measurements that actually decide the fit.
 */
export function recommendSize(
  fit: ProductFit,
  sizes: SizeSpec[],
  body: Body,
  pref: FitPref,
): SizeFitResult | null {
  const multiplier = PREF_MULTIPLIER[pref];
  const bodyFor: Record<GarmentKey, number> = {
    chest: body.chestCm,
    waist: body.waistCm,
    hips: body.hipsCm,
    shoulder: body.shoulderCm,
    inseam: body.inseamCm,
  };

  type Scored = { spec: SizeSpec; score: number; ease: SizeFitResult["ease"]; devs: Record<string, number> };
  const scored: Scored[] = [];

  for (const spec of sizes) {
    let score = 0;
    const ease: SizeFitResult["ease"] = {};
    const devs: Record<string, number> = {};

    for (const [rawKey, weight] of Object.entries(fit.weight) as [GarmentKey, number][]) {
      const garment = spec.measurements[rawKey];
      if (garment === undefined) continue;
      const target = (fit.ease[rawKey] ?? 6) * multiplier - fit.stretch * 6;
      const actual = garment - bodyFor[rawKey];
      const tolerance = fit.tolerance[rawKey] ?? 4;

      // How far the fabric may be pulled in by its own elasticity.
      const floor = -fit.stretch * bodyFor[rawKey] * 0.14;
      let deviation = (actual - target) / tolerance;
      if (actual < floor) deviation += ((floor - actual) / tolerance) * 2;

      ease[rawKey] = round(actual, 1);
      devs[rawKey] = deviation;
      score += weight * deviation * deviation;
    }

    scored.push({ spec, score, ease, devs });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);

  const best = scored[0];
  const second = scored[1];

  const confidence = clamp(
    1 / (1 + best.score) + (second ? Math.min(0.1, (second.score - best.score) / 6) : 0.08),
    0.15,
    0.96,
  );

  let weighted = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(fit.weight) as [GarmentKey, number][]) {
    if (best.devs[key] === undefined) continue;
    weighted += best.devs[key] * weight;
    total += weight;
  }
  const bias = total ? weighted / total : 0;
  const verdict: SizeFitResult["verdict"] = bias < -0.35 ? "apertado" : bias > 0.4 ? "amplo" : "ideal";

  const notes: string[] = [];
  for (const [key, deviation] of Object.entries(best.devs) as [GarmentKey, number][]) {
    if (Math.abs(deviation) < 0.7) continue;
    const tight = deviation < 0;
    const severity = Math.abs(deviation) > 1.4 ? "bem" : "um pouco";
    notes.push(`O${KEY_LABEL[key]} fica ${tight ? "mais justo" : "mais folgado"} (${severity}).`);
  }
  if (!best.spec.stock) notes.unshift("Esse tamanho está sem estoque no momento.");

  return {
    size: best.spec.size,
    stock: best.spec.stock,
    confidence: round(confidence, 2),
    verdict,
    ease: best.ease,
    notes,
  };
}

export type BodyShape = "ampulheta" | "triangle" | "inverted" | "retangulo" | "oval";

export type StyleProfile = {
  fitPref: FitPref;
  styles: string[];
  occasions: string[];
  budget: number;
  palette: string[];
  shape: BodyShape;
};

export type RankableProduct = {
  id: string;
  price: number;
  styles: string[];
  occasions: string[];
  colorHex: string;
  flatters: BodyShape[];
};

export type RankPart = {
  fit: number;
  style: number;
  occasion: number;
  budget: number;
  color: number;
  silhouette: number;
};

export type RankResult = { id: string; score: number; parts: RankPart };

function overlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter((item) => setB.has(item)).length;
  return hits / Math.max(1, Math.min(a.length, b.length));
}

function hexToHsl(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

/** A garment flatters the palette when its hue sits near a suggested hue. */
function colorHarmony(garmentHex: string, palette: string[]) {
  if (palette.length === 0) return 0.5;
  const g = hexToHsl(garmentHex);
  // Neutrals go with everything — no hue fight to lose.
  if (g.saturation < 0.12) return 0.8;
  let best = 0;
  for (const hex of palette) {
    const p = hexToHsl(hex);
    if (p.saturation < 0.12) continue;
    const raw = Math.abs(g.hue - p.hue);
    const distance = Math.min(raw, 360 - raw);
    best = Math.max(best, 1 - clamp(distance / 90, 0, 1));
  }
  return clamp(best, 0.15, 1);
}

export function rankProducts(
  products: RankableProduct[],
  sizesById: Record<string, SizeFitResult | null>,
  profile: StyleProfile,
): RankResult[] {
  const results = products.map<RankResult>((product) => {
    const fit = sizesById[product.id];
    const parts: RankPart = {
      fit: fit && fit.stock ? fit.confidence : 0.05,
      style: overlap(product.styles, profile.styles),
      occasion: overlap(product.occasions, profile.occasions),
      budget: product.price <= profile.budget ? 1 : clamp(profile.budget / product.price, 0, 1),
      color: colorHarmony(product.colorHex, profile.palette),
      silhouette: product.flatters.includes(profile.shape) ? 1 : 0.4,
    };
    const score =
      parts.fit * 0.34 +
      parts.style * 0.2 +
      parts.occasion * 0.14 +
      parts.budget * 0.12 +
      parts.color * 0.12 +
      parts.silhouette * 0.08;
    return { id: product.id, score: round(score, 3), parts };
  });

  return results.sort((a, b) => b.score - a.score);
}

export const BODY_SHAPE_LABEL: Record<BodyShape, string> = {
  ampulheta: "ampulheta",
  triangle: "triângulo",
  inverted: "triângulo invertido",
  retangulo: "retângulo",
  oval: "oval",
};
