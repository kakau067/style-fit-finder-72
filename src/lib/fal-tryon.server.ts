import { createHmac, timingSafeEqual } from "node:crypto";

export type FalTryOnModel = "idm" | "fashn";

const QUEUES: Record<FalTryOnModel, string> = {
  idm: "https://queue.fal.run/fal-ai/idm-vton",
  fashn: "https://queue.fal.run/fal-ai/fashn/tryon/v1.6",
};

export function signTryOnRequest(
  id: string,
  key: string,
  model: FalTryOnModel = "idm",
  responseUrl = "",
): string {
  // Keep accepting tickets issued to in-flight IDM jobs before the migration.
  const payload = responseUrl
    ? `tryon:${model}:${id}:${responseUrl}`
    : model === "idm"
      ? `tryon:${id}`
      : `tryon:${model}:${id}`;

  return createHmac("sha256", key).update(payload).digest("hex");
}

export function validTryOnRequest(
  id: string,
  signature: string,
  key: string,
  model: FalTryOnModel = "idm",
  responseUrl = "",
): boolean {
  if (!/^[\w-]{8,100}$/.test(id) || !/^[a-f0-9]{64}$/.test(signature)) return false;

  if (responseUrl) {
    try {
      const url = new URL(responseUrl);
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expectedPath = new RegExp(`/requests/${escapedId}/response/?$`);

      if (
        url.protocol !== "https:" ||
        !(url.hostname === "queue.fal.run" || url.hostname.endsWith(".fal.run")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !expectedPath.test(url.pathname)
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const expected = signTryOnRequest(id, key, model, responseUrl);
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

async function falJson(
  url: string,
  key: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${key}`, ...init?.headers },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const reason = (await response.text().catch(() => "")).slice(0, 250);
    throw new Error(`Serviço de prova visual respondeu ${response.status}. ${reason}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export async function submitFalTryOn(
  key: string,
  input: Record<string, unknown>,
  model: FalTryOnModel = "fashn",
) {
  const result = await falJson(QUEUES[model], key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const id = result["request_id"];
  if (typeof id !== "string" || !/^[\w-]{8,100}$/.test(id)) {
    throw new Error("O serviço não retornou uma identificação da prova.");
  }

  const responseUrl =
    typeof result["response_url"] === "string"
      ? result["response_url"]
      : `${QUEUES[model]}/requests/${encodeURIComponent(id)}/response`;

  const ticket = signTryOnRequest(id, key, model, responseUrl);
  if (!validTryOnRequest(id, ticket, key, model, responseUrl)) {
    throw new Error("O serviço retornou um endereço de resultado inválido.");
  }

  return { requestId: id, responseUrl, ticket, model };
}

export async function pollFalTryOn(
  key: string,
  id: string,
  model: FalTryOnModel = "idm",
  responseUrl = "",
) {
  const root = responseUrl
    ? (() => {
        const url = new URL(responseUrl);
        url.pathname = url.pathname.replace(/\/response\/?$/, "");
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/$/, "");
      })()
    : `${QUEUES[model]}/requests/${encodeURIComponent(id)}`;

  const status = await falJson(`${root}/status`, key);
  if (status["status"] !== "COMPLETED") {
    if (status["status"] !== "IN_QUEUE" && status["status"] !== "IN_PROGRESS") {
      throw new Error("A geração da prova foi interrompida.");
    }

    return {
      status: status["status"],
      queuePosition:
        typeof status["queue_position"] === "number" ? status["queue_position"] : null,
    };
  }

  if (typeof status["error"] === "string") throw new Error(status["error"]);

  const result = await falJson(responseUrl || `${root}/response`, key);
  const image =
    model === "fashn"
      ? (result["images"] as Array<{ url?: unknown }> | undefined)?.[0]
      : (result["image"] as { url?: unknown } | undefined);

  if (typeof image?.url !== "string") {
    throw new Error("O serviço não retornou uma imagem de prova.");
  }

  const url = new URL(image.url);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "cdn.fashn.ai" ||
      url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media")
    )
  ) {
    throw new Error("Endereço da imagem de prova inválido.");
  }

  const downloaded = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!downloaded.ok) throw new Error("Não foi possível carregar a imagem gerada.");

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Imagem gerada muito grande.");

  const mime = downloaded.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) {
    throw new Error("Formato da imagem gerada inválido.");
  }

  return {
    status: "COMPLETED" as const,
    imageDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}
