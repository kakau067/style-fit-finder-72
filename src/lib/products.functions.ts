import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { PRODUCT_IMAGE_BUCKET, rowToProduct } from "@/lib/products.shared";
import { SIZES } from "@/lib/sizing";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToProduct);
});

const merchantPrefix = (userId: string) => `lojista-${userId.replace(/-/g, "")}-`;
const merchantImagePrefix = (userId: string) => `lojistas/${userId}/`;

async function merchantAccess(context: { supabase: ReturnType<typeof publicClient>; userId: string }) {
  const { data: isAdmin, error: adminError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (adminError) throw new Error(adminError.message);
  const { data: isMerchant, error: merchantError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "user",
  });
  if (merchantError) throw new Error(merchantError.message);
  return { isAdmin: Boolean(isAdmin), isMerchant: Boolean(isAdmin || isMerchant) };
}

/** Creating a seller profile never grants the global administrator role. */
export const getAdminState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await merchantAccess(context);
    if (access.isMerchant) return { isAdmin: access.isAdmin, isMerchant: true, email: context.claims.email ?? null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "user" }, { onConflict: "user_id,role" });
    if (error) throw new Error(`Não foi possível ativar sua loja: ${error.message}`);
    return { isAdmin: false, isMerchant: true, email: context.claims.email ?? null };
  });

export const listMerchantProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await merchantAccess(context);
    if (!access.isMerchant) throw new Error("Ative sua conta de lojista antes de editar peças.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("products").select("*").order("created_at", { ascending: true });
    if (!access.isAdmin) query = query.like("slug", `${merchantPrefix(context.userId)}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToProduct);
  });

export const uploadMerchantPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    image: z.string().startsWith("data:image/jpeg;base64,").max(5_000_000),
    kind: z.enum(["front", "back", "detail"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await merchantAccess(context);
    if (!access.isMerchant) throw new Error("Ative sua conta de lojista antes do envio.");
    const raw = data.image.slice("data:image/jpeg;base64,".length);
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length || bytes.length > 3_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("Envie uma foto JPEG válida de até 3,5 MB.");
    }
    const path = `${merchantImagePrefix(context.userId)}${crypto.randomUUID()}-${data.kind}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bucket } = await supabaseAdmin.storage.getBucket(PRODUCT_IMAGE_BUCKET);
    if (!bucket) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(PRODUCT_IMAGE_BUCKET, {
        public: false, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"],
      });
      if (createError && !/already exists|duplicate/i.test(createError.message)) {
        throw new Error(`Não foi possível preparar as fotos da loja: ${createError.message}`);
      }
    }
    const { error } = await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`Falha no envio da foto: ${error.message}`);
    return path;
  });

const measurementSchema = z.record(z.string(), z.number().positive());

const sizeSpecSchema = z.object({
  size: z.enum(SIZES),
  stock: z.boolean(),
  measurements: measurementSchema,
});

const fitSchema = z.object({
  stretch: z.number().min(0).max(0.6),
  ease: measurementSchema,
  weight: measurementSchema,
  tolerance: measurementSchema,
});

const productInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífens"),
  name: z.string().min(2).max(120),
  tagline: z.string().max(200).default(""),
  price: z.number().positive().max(100000),
  audience: z.enum(["feminino", "masculino", "unissex"]),
  image_path: z.string().min(1).max(300),
  image_front_path: z.string().min(1).max(300),
  image_back_path: z.string().min(1).max(300),
  image_detail_path: z.string().min(1).max(300),
  store_url: z.string().url().max(500).or(z.literal("")),
  color_name: z.string().max(60).default(""),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fabric: z.string().max(120).default(""),
  silhouette: z.string().max(200).default(""),
  styles: z.array(z.string()).max(8).default([]),
  occasions: z.array(z.string()).max(8).default([]),
  flatters: z.array(z.string()).max(6).default([]),
  fit: fitSchema,
  sizes: z.array(sizeSpecSchema).min(1),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const access = await merchantAccess(context);
    if (!access.isMerchant) throw new Error("Ative sua conta de lojista antes de editar peças.");
    const prefix = merchantPrefix(context.userId);
    const slug = access.isAdmin || data.slug.startsWith(prefix) ? data.slug : `${prefix}${data.slug}`;
    if (!access.isAdmin && !slug.startsWith(prefix)) throw new Error("Esta peça não pertence à sua loja.");
    if (!access.isAdmin && [data.image_path, data.image_front_path, data.image_back_path, data.image_detail_path]
      .some((path) => !path.startsWith(merchantImagePrefix(context.userId)))) {
      throw new Error("As fotos devem pertencer à sua loja.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").upsert(
      { ...data, slug, updated_at: new Date().toISOString() }, { onConflict: "slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await merchantAccess(context);
    if (!access.isMerchant || (!access.isAdmin && !data.slug.startsWith(merchantPrefix(context.userId)))) {
      throw new Error("Esta peça não pertence à sua loja.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
