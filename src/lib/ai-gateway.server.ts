/**
 * Server-only Lovable AI helpers.
 *
 * Chat calls go to the gateway Responses API as a stream — reasoning runs can
 * take minutes and a buffered request would be cut off by the platform while
 * still being billed. Nothing here is importable from browser code.
 */

import { createParser } from "eventsource-parser";

export const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = "openai/gpt-6-astra";

type RunIdFetch = {
  fetch: typeof globalThis.fetch;
  readonly runId: string | undefined;
};

/**
 * Keeps the run id the gateway mints for a request so follow-up calls resend
 * it, and exposes it so the caller can hand it back to the browser.
 */
export function createLovableAiGatewayRunIdFetch(initialRunId?: string): RunIdFetch {
  let runId = initialRunId;
  const wrapped: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const response = await globalThis.fetch(input, { ...init, headers });
    const minted = response.headers.get("X-Lovable-AIG-Run-ID");
    if (minted) runId = minted;
    return response;
  };
  return {
    fetch: wrapped,
    get runId() {
      return runId;
    },
  };
}

export function getLovableAiGatewayRunId(request: Request): string | undefined {
  return request.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
}

export function withLovableAiGatewayRunIdHeader(
  response: Response,
  runIdFetch: RunIdFetch,
): Response {
  if (!runIdFetch.runId) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Lovable-AIG-Run-ID", runIdFetch.runId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export type JsonSchemaSpec = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
};

type ResponsesJsonOptions = {
  apiKey: string;
  instructions: string;
  prompt: string;
  schema: JsonSchemaSpec;
  imageDataUrl?: string;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

type StreamEvent = {
  type?: string;
  delta?: string;
  error?: { message?: string; code?: string };
  response?: {
    status?: string;
    output_text?: string;
    error?: { message?: string };
  };
};

/**
 * One-shot structured generation: asks the model for JSON matching `schema`
 * and returns the parsed object. Streams under the hood, consumes it here.
 */
export async function responsesJson({
  apiKey,
  instructions,
  prompt,
  schema,
  imageDataUrl,
  effort = "low",
  signal,
}: ResponsesJsonOptions): Promise<unknown> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();

  const content: Record<string, unknown>[] = [{ type: "input_text", text: prompt }];
  if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl });

  const upstream = await runIdFetch.fetch(`${GATEWAY_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      instructions,
      input: [{ role: "user", content }],
      stream: true,
      store: false,
      reasoning: { effort, summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          description: schema.description,
          strict: true,
          schema: schema.schema,
        },
      },
    }),
    signal: signal ?? null,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`AI gateway failed [${upstream.status}]: ${detail.slice(0, 400)}`);
  }

  let text = "";
  let completedText: string | undefined;
  let failure: string | undefined;

  const parser = createParser({
    onEvent(event) {
      let payload: StreamEvent;
      try {
        payload = JSON.parse(event.data) as StreamEvent;
      } catch {
        return;
      }
      if (event.event === "error" || payload.type === "error") {
        failure = payload.error?.message ?? "A análise de imagem falhou";
        return;
      }
      if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") {
        text += payload.delta;
        return;
      }
      if (payload.type === "response.completed") {
        completedText = payload.response?.output_text ?? undefined;
        if (payload.response?.error?.message) failure = payload.response.error.message;
      }
    },
  });

  const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.feed(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (failure) throw new Error(failure);
  const finalText = (text || completedText || "").trim();
  if (!finalText) {
    throw new Error("A análise não retornou um resultado. Tente outra foto.");
  }
  return JSON.parse(finalText);
}
