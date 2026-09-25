import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { PhotoStep, type PhotoResult } from "@/components/provador/PhotoStep";
import { ProfileStep, type Profile } from "@/components/provador/ProfileStep";
import { ResultsStep } from "@/components/provador/ResultsStep";
import { TryOnOverlay, type TryOnRequest } from "@/components/provador/TryOnOverlay";
import { Eyebrow, StepRail } from "@/components/provador/primitives";
import { PRODUCTS, PRODUCT_BY_ID, audienceMatches, type Product } from "@/data/catalog";
import { listProducts } from "@/lib/products.functions";
import { rankProducts, recommendSize, type Body, type SizeFitResult } from "@/lib/sizing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meu Avatar — provador e marketplace" },
      { name: "description", content: "Crie seu corpo digital, ajuste medidas e estilo e experimente peças do marketplace no seu avatar ou na sua foto." },
      { property: "og:title", content: "Meu Avatar — provador e marketplace" },
      { property: "og:description", content: "Seu corpo digital para descobrir tamanho, montar looks e provar roupas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = ["Escanear", "Meu Avatar", "Marketplace"];
const AVATAR_STORAGE_KEY = "style-fit-avatar-v1";

const DEFAULT_BODY: Body = { heightCm: 168, weightKg: 65, chestCm: 92, waistCm: 74, hipsCm: 98, shoulderCm: 40, inseamCm: 76 };
const DEFAULT_PROFILE: Profile = { audience: "feminino", fitPref: "acertado", styles: ["minimalista", "basico"], occasions: ["dia-a-dia", "trabalho"], budget: 450, palette: [], shape: "ampulheta" };

function Index() {
  const [stage, setStage] = useState(0);
  const [body, setBody] = useState<Body>(DEFAULT_BODY);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [tryOn, setTryOn] = useState<TryOnRequest | null>(null);
  const [avatarRecovered, setAvatarRecovered] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { body?: Body; profile?: Profile };
      if (parsed.body) setBody(parsed.body);
      if (parsed.profile) setProfile(parsed.profile);
      setAvatarRecovered(Boolean(parsed.body && parsed.profile));
    } catch { /* corrupted local profile is ignored */ }
  }, []);

  useEffect(() => {
    if (!photo) return;
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify({ body, profile }));
  }, [body, profile, photo]);

  const fetchProducts = useServerFn(listProducts);
  const catalogQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const catalog = useMemo(() => {
    if (!catalogQuery.data?.length) return PRODUCTS;
    return catalogQuery.data.map((product) => {
      const bundled = PRODUCT_BY_ID.get(product.id);
      return bundled ? { ...product, image: bundled.image, images: bundled.images } : product;
    });
  }, [catalogQuery.data]);
  const productsById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const pool = useMemo(() => catalog.filter((product) => audienceMatches(product, profile.audience)), [catalog, profile.audience]);
  const sizesById = useMemo(() => {
    const map: Record<string, SizeFitResult | null> = {};
    for (const product of pool) map[product.id] = recommendSize(product.fit, product.sizes, body, profile.fitPref);
    return map;
  }, [pool, body, profile.fitPref]);
  const ranked = useMemo(() => rankProducts(pool, sizesById, profile), [pool, sizesById, profile]);

  function handlePhoto(result: PhotoResult) {
    const a = result.analysis;
    setPhoto(result);
    setBody({ heightCm: a.height_cm, weightKg: a.weight_kg, chestCm: a.chest_cm, waistCm: a.waist_cm, hipsCm: a.hips_cm, shoulderCm: a.shoulder_cm, inseamCm: a.inseam_cm });
    setProfile((current) => ({ ...current, palette: a.palette, shape: a.body_shape }));
    setStage(1);
  }

  function handleTryOn(product: Product, fit: SizeFitResult) {
    if (!photo) return;
    setTryOn({ product, size: fit.size, fitPref: profile.fitPref, photoDataUrl: photo.photoDataUrl, body, audience: profile.audience });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div><Eyebrow>Seu corpo digital</Eyebrow><p className="font-serif text-2xl leading-none text-foreground">Meu Avatar</p></div>
          <StepRail steps={STEPS} current={stage} onJump={(index) => { if (index === 0 || photo) setStage(index); }} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {stage === 0 ? (
          <div className="space-y-5">
            {avatarRecovered ? <div className="rounded-xl border border-line bg-card px-5 py-4 text-sm text-secondary-foreground"><strong className="text-foreground">Seu avatar foi encontrado.</strong> Suas medidas e preferências estão salvas neste dispositivo. Faça um novo escaneamento para atualizar o corpo e continuar para o marketplace.</div> : null}
            <PhotoStep onDone={handlePhoto} />
          </div>
        ) : null}
        {stage === 1 && photo ? <ProfileStep body={body} profile={profile} photo={photo} estimated notes={photo.analysis.notes} confidence={photo.analysis.confidence} onBody={setBody} onProfile={setProfile} onBack={() => setStage(0)} onNext={() => setStage(2)} /> : null}
        {stage === 2 && photo ? <ResultsStep ranked={ranked} productsById={productsById} sizesById={sizesById} onTryOn={handleTryOn} onBack={() => setStage(1)} onRestart={() => { setPhoto(null); setStage(0); }} /> : null}
      </main>

      <footer className="border-t border-line"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8"><span>Seu avatar combina medidas, preferências e prova visual. Resultados de IA são referência de caimento.</span><Link to="/admin-lojista" className="focus-clay rounded-full font-mono text-[11px] uppercase tracking-[0.2em] text-secondary-foreground underline underline-offset-4">Área do lojista</Link></div></footer>
      {tryOn ? <TryOnOverlay request={tryOn} onClose={() => setTryOn(null)} /> : null}
    </div>
  );
}
