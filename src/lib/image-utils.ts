/**
 * Browser-side photo preparation.
 *
 * A phone photo is far larger than any of these features needs; resizing and
 * re-encoding here keeps uploads quick and the gateway happy, and gives the
 * user a preview that matches what the model actually sees.
 */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function isProbablyImage(file: File) {
  return file.type.startsWith("image/");
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
      image.src = url;
    });
    return image;
  } finally {
    // The decoded element keeps working after the object URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Downscales to `maxSide` and re-encodes as JPEG, returning a data URL. */
export async function fileToSizedDataURL(file: File, maxSide = 1024, quality = 0.82): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Same as above but keeps the natural aspect ratio at a smaller preview size. */
export async function fileToPreviewURL(file: File, maxSide = 520): Promise<string> {
  return fileToSizedDataURL(file, maxSide, 0.8);
}

/** Turns a data URL back into a File so it can travel as a multipart part. */
export function dataURLToFile(dataUrl: string, filename: string): File {
  const [meta = "", base64 = ""] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
