import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { responsesJson } from "./ai-gateway.server";

const BODY_SHAPES = ["ampulheta", "triangle", "inverted", "retangulo", "oval"] as const;

/**
 * Strict json_schema for the Responses API: every property listed in
 * `required`, `additionalProperties: false`, no defaults, one object at the
 * root. Anything looser is rejected with a 400 before the model is called.
 */
const ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "height_cm",
    "weight_kg",
    "chest_cm",
    "waist_cm",
    "hips_cm",
    "shoulder_cm",
    "inseam_cm",
    "body_shape",
    "undertone",
    "palette",
    "confidence",
    "notes",
  ],
  properties: {
    height_cm: { type: "integer" },
    weight_kg: { type: "integer" },
    chest_cm: { type: "number" },
    waist_cm: { type: "number" },
    hips_cm: { type: "number" },
    shoulder_cm: { type: "number" },
    inseam_cm: { type: "number" },
    body_shape: { type: "string", enum: [...BODY_SHAPES] },
    undertone: { type: "string", enum: ["quente", "frio", "neutro"] },
    palette: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
};

const INSTRUCTIONS = `Você é estilista e analista de medidas corporais de um provador virtual brasileiro.
A partir de UMA foto de corpo inteiro, estime as medidas da pessoa em centímetros e o peso em quilos.

Regras:
- Estime a partir do que a foto mostra: altura aparente, largura de ombro, linha do busto, cintura, quadril e comprimento de perna.
- Use números plausíveis e coerentes entre si (ex.: busto e quadril próximos para corpo ampulheta; busto maior que quadril para triângulo invertido).
- Se a pessoa usar roupa larga, considere o corpo por baixo da roupa, não a roupa.
- "confidence" é sua autopercepção honesta de 0 a 1: fotos parciais, sentadas, de lado ou mal iluminadas justificam confiança baixa.
- "palette" são 5 cores em hexadecimal (#RRGGBB) que favorecem o subtom de pele percebido.
- "notes" é uma frase curta em português, sem rodeios, dizendo o que a foto permitiu ou não avaliar.
- Nunca invente que a pessoa confirmou as medidas: elas serão revisadas por ela mesma.`;

const PROMPT = `Analise esta foto de corpo inteiro e devolva as medidas estimadas no formato solicitado.`;

const EstimateResult = z.object({
  height_cm: z.number().int().min(110).max(230),
  weight_kg: z.number().int().min(30).max(250),
  chest_cm: z.number().min(60).max(160),
  waist_cm: z.number().min(50).max(160),
  hips_cm: z.number().min(60).max(170),
  shoulder_cm: z.number().min(28).max(62),
  inseam_cm: z.number().min(50).max(110),
  body_shape: z.enum(BODY_SHAPES),
  undertone: z.enum(["quente", "frio", "neutro"]),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(8),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(400),
});

export type PhotoAnalysis = z.infer<typeof EstimateResult>;

export const analyzePhoto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/").max(8_000_000) }).parse(input),
  )
  .handler(async ({ data }): Promise<PhotoAnalysis> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("O serviço de análise não está configurado.");

    const raw = await responsesJson({
      apiKey,
      instructions: INSTRUCTIONS,
      prompt: PROMPT,
      imageDataUrl: data.imageDataUrl,
      schema: {
        name: "estimate_body",
        description: "Medidas corporais estimadas a partir de uma foto de corpo inteiro",
        schema: ESTIMATE_SCHEMA,
      },
      effort: "low",
    });

    return EstimateResult.parse(raw);
  });
