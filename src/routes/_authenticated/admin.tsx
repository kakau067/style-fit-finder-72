import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, ErrorNote, Eyebrow, Panel, ToggleChip } from "@/components/provador/primitives";
import { OCCASION_LABEL, OCCASIONS, STYLE_LABEL, STYLE_TAGS, type Product } from "@/data/catalog";
import { supabase } from "@/integrations/supabase/client";
import { fileToSizedDataURL } from "@/lib/image-utils";
import { productImageUrl, PRODUCT_IMAGE_BUCKET } from "@/lib/products.shared";
import { deleteProduct, getAdminState, listProducts, saveProduct } from "@/lib/products.functions";
import { SIZES, type BodyShape, type SizeSpec } from "@/lib/sizing";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Área do lojista — catálogo | Provador Virtual" },
      {
        name: "description",
        content: "Cadastre as peças da loja com foto, preço e tabela de medidas.",
      },
      { property: "og:title", content: "Área do lojista — catálogo" },
      { property: "og:description", content: "Cadastro de peças com foto e medidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Category = "top" | "bottom" | "dress";

const CATEGORY_LABEL: Record<Category, string> = {
  top: "Parte de cima",
  bottom: "Parte de baixo",
  dress: "Vestido / peça única",
};

const CATEGORY_MEASURES: Record<Category, { key: string; label: string }[]> = {
  top: [
    { key: "chest", label: "Busto / tórax" },
    { key: "waist", label: "Cintura" },
    { key: "shoulder", label: "Ombros" },
  ],
  bottom: [
    { key: "waist", label: "Cintura" },
    { key: "hips", label: "Quadril" },
    { key: "inseam", label: "Gancho / cavalo" },
  ],
  dress: [
    { key: "chest", label: "Busto / tórax" },
    { key: "waist", label: "Cintura" },
    { key: "hips", label: "Quadril" },
  ],
};

const FIT_TEMPLATES: Record<Category, Product["fit"]> = {
  top: {
    stretch: 0.1,
    ease: { chest: 8, waist: 6, shoulder: 1.5 },
    weight: { chest: 0.55, waist: 0.2, shoulder: 0.25 },
    tolerance: { chest: 5, waist: 5, shoulder: 1.6 },
  },
  bottom: {
    stretch: 0.08,
    ease: { waist: 2, hips: 6, inseam: 0 },
    weight: { waist: 0.45, hips: 0.4, inseam: 0.15 },
    tolerance: { waist: 2.5, hips: 4, inseam: 3 },
  },
  dress: {
    stretch: 0.05,
    ease: { chest: 8, waist: 6, hips: 8 },
    weight: { chest: 0.4, waist: 0.3, hips: 0.3 },
    tolerance: { chest: 5, waist: 4, hips: 5 },
  },
};

const SHAPES: { key: BodyShape; label: string }[] = [
  { key: "ampulheta", label: "ampulheta" },
  { key: "triangle", label: "triângulo" },
  { key: "inverted", label: "triângulo invertido" },
  { key: "retangulo", label: "retângulo" },
  { key: "oval", label: "oval" },
];

function categoryOf(product: Product): Category {
  const keys = Object.keys(product.fit.ease);
  if (keys.includes("inseam")) return "bottom";
  if (keys.includes("hips")) return "dress";
  return "top";
}

function emptySizes(category: Category): SizeSpec[] {
  const base: Record<string, Record<string, number>> = {
    top: { chest: 96, waist: 90, shoulder: 42 },
    bottom: { waist: 70, hips: 98, inseam: 72 },
    dress: { chest: 94, waist: 78, hips: 102 },
  };
  return SIZES.map((size, index) => ({
    size,
    stock: true,
    measurements: Object.fromEntries(
      CATEGORY_MEASURES[category].map(({ key }) => [key, (base[category][key] ?? 80) + index * 6]),
    ),
  }));
}

type Draft = {
  slug: string;
  name: string;
  tagline: string;
  price: string;
  audience: Product["audience"];
  category: Category;
  imagePath: string;
  colorName: string;
  colorHex: string;
  fabric: string;
  silhouette: string;
  styles: string[];
  occasions: string[];
  flatters: string[];
  stretch: number;
  sizes: SizeSpec[];
};

const EMPTY_DRAFT: Draft = {
  slug: "",
  name: "",
  tagline: "",
  price: "",
  audience: "unissex",
  category: "top",
  imagePath: "",
  colorName: "",
  colorHex: "#C08B54",
  fabric: "",
  silhouette: "",
  styles: [],
  occasions: [],
  flatters: [],
  stretch: 0.1,
  sizes: emptySizes("top"),
};

function draftFromProduct(product: Product): Draft {
  const category = categoryOf(product);
  return {
    slug: product.id,
    name: product.name,
    tagline: product.tagline,
    price: String(product.price),
    audience: product.audience,
    category,
    imagePath: "",
    colorName: product.colorName,
    colorHex: product.colorHex,
    fabric: product.fabric,
    silhouette: product.silhouette,
    styles: product.styles,
    occasions: product.occasions,
    flatters: product.flatters,
    stretch: product.fit.stretch,
    sizes: product.sizes,
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function AdminPage() {
  const navigate = useNavigate();
  const runGetAdminState = useServerFn(getAdminState);
  const runListProducts = useServerFn(listProducts);
  const runSaveProduct = useServerFn(saveProduct);
  const runDeleteProduct = useServerFn(deleteProduct);

  const [status, setStatus] = useState<"carregando" | "negado" | "pronto">("carregando");
  const [email, setEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    const list = await runListProducts();
    setProducts(list);
    return list;
  }, [runListProducts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await runGetAdminState();
      if (cancelled) return;
      if (!state.isAdmin) {
        setStatus("negado");
        setEmail(state.email);
        return;
      }
      setEmail(state.email);
      setStatus("pronto");
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [runGetAdminState, refresh]);

  useEffect(() => {
    // Image paths are not part of the public Product shape; fetch rows once
    // for the edit form.
    void (async () => {
      const { data } = await supabase.from("products").select("slug, image_path");
      if (data) {
        setImagePaths(Object.fromEntries(data.map((row) => [row.slug, row.image_path])));
      }
    })();
  }, [products]);

  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  async function uploadPhoto(slug: string): Promise<string | null> {
    if (!photoFile) return draft?.imagePath || imagePaths[slug] || null;
    const dataUrl = await fileToSizedDataURL(photoFile);
    const blob = await (await fetch(dataUrl)).blob();
    const path = `pecas/${slug}-${Date.now()}.jpg`;
    const { error: err } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (err) throw new Error(`Falha no upload da foto: ${err.message}`);
    return path;
  }

  async function submitDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const slug = draft.slug || slugify(draft.name);
      if (!slug) throw new Error("Informe o nome da peça.");
      const imagePath = await uploadPhoto(slug);
      if (!imagePath) throw new Error("Envie a foto da peça.");
      const template = FIT_TEMPLATES[draft.category];
      await runSaveProduct({
        data: {
          slug,
          name: draft.name,
          tagline: draft.tagline,
          price: Number(draft.price),
          audience: draft.audience,
          image_path: imagePath,
          color_name: draft.colorName,
          color_hex: draft.colorHex,
          fabric: draft.fabric,
          silhouette: draft.silhouette,
          styles: draft.styles,
          occasions: draft.occasions,
          flatters: draft.flatters,
          fit: { ...template, stretch: draft.stretch },
          sizes: draft.sizes,
        },
      });
      setDraft(null);
      setPhotoFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    if (!window.confirm("Remover esta peça do catálogo?")) return;
    setError(null);
    try {
      await runDeleteProduct({ data: { slug } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  if (status === "carregando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          abrindo o ateliê…
        </p>
      </div>
    );
  }

  if (status === "negado") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <Panel className="max-w-md p-8 text-center">
          <Eyebrow>Acesso restrito</Eyebrow>
          <p className="mt-3 font-serif text-2xl text-foreground">Esta conta não é do lojista</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `${email} não tem permissão para editar o catálogo.` : ""} Entre com a conta do
            lojista.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => void supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}>
              Trocar de conta
            </Button>
            <Link to="/">
              <Button variant="ghost">Voltar ao provador</Button>
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const inputClass =
    "focus-clay w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <Eyebrow>Área do lojista</Eyebrow>
            <p className="font-serif text-2xl leading-none text-foreground">Catálogo do provador</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">{email}</span>
            <Link to="/">
              <Button variant="ghost">Ver provador</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => void supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}
            >
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {draft ? (
          <Panel className="mt-6 p-6 sm:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-2xl text-foreground">
                {draft.slug ? "Editar peça" : "Nova peça"}
              </h2>
              <Button variant="ghost" onClick={() => { setDraft(null); setPhotoFile(null); }}>
                Cancelar
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <Eyebrow>Nome da peça</Eyebrow>
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Vestido Midi de Linho"
                />
              </label>
              <label className="space-y-1.5">
                <Eyebrow>Preço (R$)</Eyebrow>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  placeholder="459"
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <Eyebrow>Descrição curta</Eyebrow>
                <input
                  className={inputClass}
                  value={draft.tagline}
                  onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                  placeholder="Linho lavado com cinto para amarrar e saia evasê."
                />
              </label>
              <label className="space-y-1.5">
                <Eyebrow>Tecido</Eyebrow>
                <input
                  className={inputClass}
                  value={draft.fabric}
                  onChange={(e) => setDraft({ ...draft, fabric: e.target.value })}
                  placeholder="Linho europeu"
                />
              </label>
              <label className="space-y-1.5">
                <Eyebrow>Caimento (frase curta)</Eyebrow>
                <input
                  className={inputClass}
                  value={draft.silhouette}
                  onChange={(e) => setDraft({ ...draft, silhouette: e.target.value })}
                  placeholder="Saia evasê que afasta do quadril sem volume."
                />
              </label>
              <label className="space-y-1.5">
                <Eyebrow>Nome da cor</Eyebrow>
                <input
                  className={inputClass}
                  value={draft.colorName}
                  onChange={(e) => setDraft({ ...draft, colorName: e.target.value })}
                  placeholder="terracota"
                />
              </label>
              <label className="space-y-1.5">
                <Eyebrow>Cor</Eyebrow>
                <input
                  type="color"
                  className="h-10 w-full cursor-pointer rounded-lg border border-line bg-background"
                  value={draft.colorHex}
                  onChange={(e) => setDraft({ ...draft, colorHex: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Eyebrow>Público</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {(["feminino", "masculino", "unissex"] as const).map((aud) => (
                    <ToggleChip
                      key={aud}
                      active={draft.audience === aud}
                      onClick={() => setDraft({ ...draft, audience: aud })}
                    >
                      {aud}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Eyebrow>Tipo de peça</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                    <ToggleChip
                      key={cat}
                      active={draft.category === cat}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          category: cat,
                          sizes: emptySizes(cat),
                          stretch: FIT_TEMPLATES[cat].stretch,
                        })
                      }
                    >
                      {CATEGORY_LABEL[cat]}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Eyebrow>Estilos</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {STYLE_TAGS.map((tag) => (
                    <ToggleChip
                      key={tag}
                      active={draft.styles.includes(tag)}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          styles: draft.styles.includes(tag)
                            ? draft.styles.filter((t) => t !== tag)
                            : [...draft.styles, tag],
                        })
                      }
                    >
                      {STYLE_LABEL[tag]}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Eyebrow>Ocasiões</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((occ) => (
                    <ToggleChip
                      key={occ}
                      active={draft.occasions.includes(occ)}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          occasions: draft.occasions.includes(occ)
                            ? draft.occasions.filter((o) => o !== occ)
                            : [...draft.occasions, occ],
                        })
                      }
                    >
                      {OCCASION_LABEL[occ]}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Eyebrow>Favorece os biotipos</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {SHAPES.map((shape) => (
                    <ToggleChip
                      key={shape.key}
                      active={draft.flatters.includes(shape.key)}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          flatters: draft.flatters.includes(shape.key)
                            ? draft.flatters.filter((f) => f !== shape.key)
                            : [...draft.flatters, shape.key],
                        })
                      }
                    >
                      {shape.label}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-line bg-background p-4">
              <Eyebrow>Foto da peça</Eyebrow>
              <p className="mt-1 text-xs text-muted-foreground">
                Prefira foto nítida, com fundo claro e a peça inteira visível. Ela aparece nas
                recomendações e alimenta a prova visual.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {photoFile ? (
                  <img
                    src={URL.createObjectURL(photoFile)}
                    alt="Prévia da foto da peça"
                    className="h-24 w-24 rounded-lg border border-line object-cover"
                  />
                ) : draft.slug && imagePaths[draft.slug] ? (
                  <img
                    src={productImageUrl(imagePaths[draft.slug])}
                    alt="Foto atual da peça"
                    className="h-24 w-24 rounded-lg border border-line object-cover"
                  />
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Foto da peça"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-secondary-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:text-primary-foreground"
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <Eyebrow>Tabela de medidas da peça (cm)</Eyebrow>
                <span className="text-xs text-muted-foreground">
                  medidas da peça vestida, não do corpo
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <th className="py-2 pr-3">Tam.</th>
                      {CATEGORY_MEASURES[draft.category].map(({ label }) => (
                        <th key={label} className="py-2 pr-3">{label}</th>
                      ))}
                      <th className="py-2">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.sizes.map((size, index) => (
                      <tr key={size.size} className="border-t border-line">
                        <td className="py-2 pr-3 font-mono text-xs">{size.size}</td>
                        {CATEGORY_MEASURES[draft.category].map(({ key }) => (
                          <td key={key} className="py-2 pr-3">
                            <input
                              type="number"
                              min={1}
                              className="focus-clay w-20 rounded-md border border-line bg-background px-2 py-1.5 text-sm"
                              value={size.measurements[key] ?? ""}
                              onChange={(e) => {
                                const sizes = draft.sizes.map((s, i) =>
                                  i === index
                                    ? {
                                        ...s,
                                        measurements: {
                                          ...s.measurements,
                                          [key]: Number(e.target.value),
                                        },
                                      }
                                    : s,
                                );
                                setDraft({ ...draft, sizes });
                              }}
                            />
                          </td>
                        ))}
                        <td className="py-2">
                          <input
                            type="checkbox"
                            aria-label={`Estoque tamanho ${size.size}`}
                            checked={size.stock}
                            onChange={(e) => {
                              const sizes = draft.sizes.map((s, i) =>
                                i === index ? { ...s, stock: e.target.checked } : s,
                              );
                              setDraft({ ...draft, sizes });
                            }}
                            className="size-4 accent-primary"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-line bg-background p-4">
              <div className="flex items-baseline justify-between">
                <Eyebrow>Elasticidade do tecido</Eyebrow>
                <span className="font-mono text-xs text-foreground">
                  {Math.round(draft.stretch * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.01}
                value={draft.stretch}
                aria-label="Elasticidade do tecido"
                onChange={(e) => setDraft({ ...draft, stretch: Number(e.target.value) })}
                className="focus-clay mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                0% = tecido plano sem elastano · 40% = malha bem elástica
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={() => void submitDraft()} disabled={busy}>
                {busy ? "Salvando…" : "Salvar peça"}
              </Button>
              <Button variant="ghost" onClick={() => { setDraft(null); setPhotoFile(null); }}>
                Cancelar
              </Button>
            </div>
          </Panel>
        ) : (
          <>
            <div className="mt-2 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {products.length} {products.length === 1 ? "peça cadastrada" : "peças cadastradas"}
              </p>
              <Button
                onClick={() => {
                  setDraft({ ...EMPTY_DRAFT, sizes: emptySizes("top") });
                  setPhotoFile(null);
                }}
              >
                + Nova peça
              </Button>
            </div>

            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((product) => (
                <li key={product.id}>
                  <Panel className="overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="space-y-2 p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-serif text-lg leading-tight text-foreground">
                          {product.name}
                        </p>
                        <p className="font-mono text-sm text-foreground">
                          R$ {product.price.toFixed(0)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {product.audience} · {product.colorName}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          className="px-3.5 py-1.5 text-xs"
                          onClick={() => {
                            setDraft(draftFromProduct(product));
                            setPhotoFile(null);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-3.5 py-1.5 text-xs text-destructive"
                          onClick={() => void remove(product.id)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
