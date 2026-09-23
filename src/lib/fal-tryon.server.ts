import { createHmac, timingSafeEqual } from "node:crypto";

const QUEUE = "https://queue.fal.run/fal-ai/idm-vton";

export function signTryOnRequest(id: string, key: string): string {
  return createHmac("sha256", key).update(`tryon:${id}`).digest("hex");
}

export function validTryOnRequest(id: string, signature: string, key: string): boolean {
  if (!/^[\w-]{8,100}$/.test(id) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signTryOnRequest(id, key), "hex"));
}

async function falJson(url: string, key: string, init?: RequestInit): Promise<Record<string, unknown>> {
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

export async function submitFalTryOn(key: string, input: Record<string, unknown>) {
  const result = await falJson(QUEUE, key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const id = result["request_id"];
  if (typeof id !== "string" || !/^[\w-]{8,100}$/.test(id)) throw new Error("O serviço não retornou uma identificação da prova.");
  return { requestId: id, ticket: signTryOnRequest(id, key) };
}

export async function pollFalTryOn(key: string, id: string) {
  const root = `${QUEUE}/requests/${encodeURIComponent(id)}`;
  const status = await falJson(`${root}/status`, key);
  if (status["status"] !== "COMPLETED") {
    if (status["status"] !== "IN_QUEUE" && status["status"] !== "IN_PROGRESS") throw new Error("A geração da prova foi interrompida.");
    return { status: status["status"], queuePosition: typeof status["queue_position"] === "number" ? status["queue_position"] : null };
  }
  const result = await falJson(root, key);
  const image = result["image"] as { url?: unknown } | undefined;
  if (typeof image?.url !== "string") throw new Error("O serviço não retornou uma imagem de prova.");
  const url = new URL(image.url);
  if (url.protocol !== "https:" || (url.hostname !== "fal.media" && !url.hostname.endsWith(".fal.media"))) {
    throw new Error("Endereço da imagem de prova inválido.");
  }
  const downloaded = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!downloaded.ok) throw new Error("Não foi possível carregar a imagem gerada.");
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Imagem gerada muito grande.");
  const mime = downloaded.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("Formato da imagem gerada inválido.");
  return { status: "COMPLETED" as const, imageDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` };
}
