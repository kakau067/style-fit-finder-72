import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PhotoStep, type PhotoResult } from "@/components/provador/PhotoStep";
import { ProfileStep, type Profile } from "@/components/provador/ProfileStep";
import { ResultsStep } from "@/components/provador/ResultsStep";
import { TryOnOverlay, type TryOnRequest } from "@/components/provador/TryOnOverlay";
import { Eyebrow, StepRail } from "@/components/provador/primitives";
import { PRODUCTS, PRODUCT_BY_ID, audienceMatches, type Product } from "@/data/catalog";
import {
  rankProducts,
  recommendSize,
  type Body,
  type SizeFitResult,
} from "@/lib/sizing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Provador Virtual — tamanho certo pela sua foto" },
      {
        name: "description",
        content:
          "Envie uma foto de corpo inteiro, confira suas medidas e receba o tamanho certo de cada peça, com prova visual gerada na hora.",
      },
      { property: "og:title", content: "Provador Virtual — tamanho certo pela sua foto" },
      {
        property: "og:description",
        content:
          "Recomendação de tamanho e estilo a partir de uma foto, com prova visual das peças no seu corpo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = ["Foto", "Medidas", "Recomendações"];

const DEFAULT_BODY: Body = {
  heightCm: 168,
  weightKg: 65,
  chestCm: 92,
  waistCm: 74,
  hipsCm: 98,
  shoulderCm: 40,
  inseamCm: 76,
};

const DEFAULT_PROFILE: Profile = {
  audience: "feminino",
  fitPref: "acertado",
  styles: ["minimalista", "basico"],
  occasions: ["dia-a-dia", "trabalho"],
  budget: 450,
  palette: [],
  shape: "ampulheta",
};

function Index() {
  const [stage, setStage] = useState(0);
  const [body, setBody] = useState<Body>(DEFAULT_BODY);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [tryOn, setTryOn] = useState<TryOnRequest | null>(null);

  const pool = useMemo(
    () => PRODUCTS.filter((product) => audienceMatches(product, profile.audience)),
    [profile.audience],
  );

  const sizesById = useMemo(() => {
    const map: Record<string, SizeFitResult | null> = {};
    for (const product of pool) {
      map[product.id] = recommendSize(product.fit, product.sizes, body, profile.fitPref);
    }
    return map;
  }, [pool, body, profile.fitPref]);

  const ranked = useMemo(
    () => rankProducts(pool, sizesById, profile),
    [pool, sizesById, profile],
  );

  function handlePhoto(result: PhotoResult) {
    const a = result.analysis;
    setPhoto(result);
    setBody({
      heightCm: a.height_cm,
      weightKg: a.weight_kg,
      chestCm: a.chest_cm,
      waistCm: a.waist_cm,
      hipsCm: a.hips_cm,
      shoulderCm: a.shoulder_cm,
      inseamCm: a.inseam_cm,
    });
    setProfile((current) => ({ ...current, palette: a.palette, shape: a.body_shape }));
    setStage(1);
  }

  function handleTryOn(product: Product, fit: SizeFitResult) {
    if (!photo) return;
    setTryOn({
      product,
      size: fit.size,
      fitPref: profile.fitPref,
      photoDataUrl: photo.photoDataUrl,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <Eyebrow>Ateliê digital</Eyebrow>
            <p className="font-serif text-2xl leading-none text-foreground">Provador Virtual</p>
          </div>
          <StepRail
            steps={STEPS}
            current={stage}
            onJump={(index) => {
              if (index === 0 || photo) setStage(index);
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {stage === 0 ? <PhotoStep onDone={handlePhoto} /> : null}

        {stage === 1 && photo ? (
          <ProfileStep
            body={body}
            profile={profile}
            estimated
            notes={photo.analysis.notes}
            confidence={photo.analysis.confidence}
            onBody={setBody}
            onProfile={setProfile}
            onBack={() => setStage(0)}
            onNext={() => setStage(2)}
          />
        ) : null}

        {stage === 2 && photo ? (
          <ResultsStep
            ranked={ranked}
            productsById={PRODUCT_BY_ID}
            sizesById={sizesById}
            onTryOn={handleTryOn}
            onBack={() => setStage(1)}
            onRestart={() => {
              setPhoto(null);
              setBody(DEFAULT_BODY);
              setProfile(DEFAULT_PROFILE);
              setStage(0);
            }}
          />
        ) : null}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-6 text-xs text-muted-foreground sm:px-8">
          Catálogo de demonstração. As estimativas e provas visuais são geradas por IA e servem como
          referência de caimento.
        </div>
      </footer>

      {tryOn ? <TryOnOverlay request={tryOn} onClose={() => setTryOn(null)} /> : null}
    </div>
  );
}
