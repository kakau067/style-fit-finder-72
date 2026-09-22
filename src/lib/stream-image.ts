import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type ImagePayload = { type?: string; b64_json?: string; error?: { message?: string } };

/**
 * Posts to the app's image route and renders every frame the gateway sends.
 *
 * The loop runs until the body is truly done: partial PNGs, the completed
 * event and trailing SSE comments all arrive in their own time, and a
 * premature exit would drop the finished image.
 */
export async function streamImage(
  endpoint: string,
  input: Record<string, unknown> | FormData,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<void> {
  const send = (stream: boolean) => {
    signal?.throwIfAborted();
    const requestHeaders = new Headers(headers);
    let body: FormData | string;
    if (input instanceof FormData) {
      const form = new FormData();
      input.forEach((value, name) => form.append(name, value));
      form.set("stream", String(stream));
      if (!stream) form.delete("partial_images");
      body = form;
      requestHeaders.delete("Content-Type");
    } else {
      const payload: Record<string, unknown> = { ...input, stream };
      if (!stream) delete payload["partial_images"];
      body = JSON.stringify(payload);
      requestHeaders.set("Content-Type", "application/json");
    }
    return fetch(endpoint, { method: "POST", headers: requestHeaders, body, signal: signal ?? null });
  };

  const res = await send(true);
  if (!res.ok || !res.body) {
    throw new Error(`Falha na prova visual: ${res.status} ${await res.text().catch(() => "")}`);
  }

  let sawCompleted = false;
  let sawAnyEvent = false;
  let streamError: string | undefined;

  const parser = createParser({
    onEvent(event) {
      let payload: ImagePayload | undefined;
      try {
        payload = JSON.parse(event.data) as ImagePayload;
      } catch {
        payload = undefined;
      }
      if (event.event === "error" || payload?.type === "error") {
        sawAnyEvent = true;
        streamError = payload?.error?.message ?? "A prova visual falhou";
        return;
      }
      const type = event.event || payload?.type;
      if (
        type !== "image_generation.partial_image" &&
        type !== "image_generation.completed" &&
        type !== "image_edit.partial_image" &&
        type !== "image_edit.completed"
      )
        return;
      sawAnyEvent = true;
      if (!payload?.b64_json) {
        streamError = "A prova visual não retornou uma imagem";
        return;
      }
      const b64 = payload.b64_json;
      const isFinal = type === "image_generation.completed" || type === "image_edit.completed";
      // React batches callbacks from coalesced SSE events unless committed here.
      flushSync(() => onFrame(`data:image/png;base64,${b64}`, isFinal));
      if (isFinal) sawCompleted = true;
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal?.aborted || sawAnyEvent || (error instanceof Error && error.name === "AbortError")) throw error;
        break;
      }
      if (chunk.done) break;
      parser.feed(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  signal?.throwIfAborted();
  if (streamError) throw new Error(streamError);

  if (!sawAnyEvent) {
    const replay = await send(false);
    if (!replay.ok) {
      throw new Error(`Falha na prova visual: ${replay.status} ${await replay.text().catch(() => "")}`);
    }
    const json = (await replay.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("A prova visual não retornou uma imagem");
    onFrame(`data:image/png;base64,${b64}`, true);
    return;
  }

  if (!sawCompleted) throw new Error("A prova visual foi interrompida antes de terminar");
}
