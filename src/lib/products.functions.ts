import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { rowToProduct } from "@/lib/products.shared";
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

/**
 * Admin bootstrap: the first person to enter the merchant area becomes the
 * admin. After that, only existing admins keep access.
 */
export const getAdminState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin) return { isAdmin: true, email: context.claims.email ?? null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { isAdmin: false, email: context.claims.email ?? null };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { isAdmin: true, email: context.claims.email ?? null };
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas o lojista pode editar o catálogo.");

    const { error } = await context.supabase.from("products").upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas o lojista pode editar o catálogo.");

    const { error } = await context.supabase.from("products").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
