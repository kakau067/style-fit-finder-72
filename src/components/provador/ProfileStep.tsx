import { useState } from "react";
import { Button, Eyebrow, Field, MeasureField, Panel, ToggleChip } from "@/components/provador/primitives";
import { Mannequin3D } from "@/components/provador/Mannequin3D";
import type { PhotoResult } from "@/components/provador/PhotoStep";
import { OCCASIONS, OCCASION_LABEL, STYLE_LABEL, STYLE_TAGS } from "@/data/catalog";
import { BODY_SHAPE_LABEL, type Body, type BodyShape, type FitPref, type StyleProfile } from "@/lib/sizing";

export type Audience = "feminino" | "masculino";
export type Profile = StyleProfile & { audience: Audience };

const FIT_OPTIONS: { value: FitPref; label: string; hint: string }[] = [
  { value: "justo", label: "Justo", hint: "marca o corpo" }, { value: "acertado", label: "Acertado", hint: "como foi modelado" }, { value: "solto", label: "Solto", hint: "com folga" },
];
const SHAPES: BodyShape[] = ["ampulheta", "triangle", "inverted", "retangulo", "oval"];
function toggle(list: string[], value: string) { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }

export function ProfileStep({ body, profile, photo, estimated, notes, confidence, onBody, onProfile, onBack, onNext }: { body: Body; profile: Profile; photo: PhotoResult; estimated: boolean; notes: string; confidence: number; onBody: (body: Body) => void; onProfile: (profile: Profile) => void; onBack: () => void; onNext: () => void; }) {
  const [view, setView] = useState<"photo" | "mannequin">("mannequin");
  const set = <K extends keyof Body>(key: K, value: number) => onBody({ ...body, [key]: value });
  const patch = (next: Partial<Profile>) => onProfile({ ...profile, ...next });

  return <div className="space-y-6">
    <div><Eyebrow>Meu Avatar</Eyebrow><h2 className="mt-3 font-serif text-3xl text-foreground sm:text-4xl">Ajuste seu corpo digital</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary-foreground">O escaneamento inicia suas medidas. Confira o corpo em 360°, ajuste o que precisar e defina como você gosta de vestir. Essas escolhas serão usadas no marketplace.</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-start">
      <Panel className="p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3"><Eyebrow>Corpo</Eyebrow><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">análise {Math.round(confidence * 100)}%</span></div>
        <p className="mt-3 text-sm leading-relaxed text-secondary-foreground">{notes || "Ajuste qualquer medida que não bater com a fita métrica."}</p>
        <div className="measure-tape mt-5 grid gap-3 sm:grid-cols-2">
          <MeasureField label="Altura" value={body.heightCm} min={130} max={215} step={1} estimated={estimated} onChange={(v) => set("heightCm", v)} />
          <MeasureField label="Peso" unit="kg" value={body.weightKg} min={35} max={200} step={1} estimated={estimated} onChange={(v) => set("weightKg", v)} />
          <MeasureField label="Busto / tórax" value={body.chestCm} min={65} max={150} estimated={estimated} onChange={(v) => set("chestCm", v)} />
          <MeasureField label="Cintura" value={body.waistCm} min={55} max={150} estimated={estimated} onChange={(v) => set("waistCm", v)} />
          <MeasureField label="Quadril" value={body.hipsCm} min={65} max={160} estimated={estimated} onChange={(v) => set("hipsCm", v)} />
          <MeasureField label="Ombro" value={body.shoulderCm} min={30} max={60} estimated={estimated} onChange={(v) => set("shoulderCm", v)} />
          <MeasureField label="Entrepernas" value={body.inseamCm} min={55} max={105} estimated={estimated} onChange={(v) => set("inseamCm", v)} />
        </div>
      </Panel>

      <div className="space-y-4 lg:sticky lg:top-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><Eyebrow>Visualização</Eyebrow><div className="flex gap-2"><ToggleChip active={view === "mannequin"} onClick={() => setView("mannequin")}>Avatar 360°</ToggleChip><ToggleChip active={view === "photo"} onClick={() => setView("photo")}>Foto original</ToggleChip></div></div>
        {view === "mannequin" ? <Mannequin3D body={body} audience={profile.audience} /> : <div className="overflow-hidden rounded-xl border border-line bg-card"><div className="flex h-[520px] items-center justify-center bg-secondary/30 p-3"><img src={photo.previewUrl} alt="Foto usada para criar o perfil corporal" className="max-h-full max-w-full rounded-lg object-contain" /></div></div>}
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">{view === "mannequin" ? "Arraste para girar, use zoom e confira as proporções do avatar. As medidas alteram a representação corporal." : "A foto original fica disponível para a prova visual por IA; ela não é substituída pelo avatar 3D."}</p>
      </div>

      <Panel className="p-6 sm:p-7 lg:col-span-2">
        <Eyebrow>Estilo do avatar</Eyebrow><h3 className="mt-3 font-serif text-2xl text-foreground">Como você quer comprar e vestir</h3>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Field label="Modelagem"><div className="flex flex-wrap gap-2">{(["feminino", "masculino"] as Audience[]).map((value) => <ToggleChip key={value} active={profile.audience === value} onClick={() => patch({ audience: value })}>{value}</ToggleChip>)}</div></Field>
          <Field label="Caimento preferido"><div className="flex flex-wrap gap-2">{FIT_OPTIONS.map((option) => <ToggleChip key={option.value} active={profile.fitPref === option.value} onClick={() => patch({ fitPref: option.value })}>{option.label}<span className="ml-1.5 text-xs opacity-70">{option.hint}</span></ToggleChip>)}</div></Field>
          <Field label="Silhueta"><div className="flex flex-wrap gap-2">{SHAPES.map((shape) => <ToggleChip key={shape} active={profile.shape === shape} onClick={() => patch({ shape })}>{BODY_SHAPE_LABEL[shape]}</ToggleChip>)}</div></Field>
          <Field label="Estilo"><div className="flex flex-wrap gap-2">{STYLE_TAGS.map((tag) => <ToggleChip key={tag} active={profile.styles.includes(tag)} onClick={() => patch({ styles: toggle(profile.styles, tag) })}>{STYLE_LABEL[tag]}</ToggleChip>)}</div></Field>
          <Field label="Ocasião"><div className="flex flex-wrap gap-2">{OCCASIONS.map((occasion) => <ToggleChip key={occasion} active={profile.occasions.includes(occasion)} onClick={() => patch({ occasions: toggle(profile.occasions, occasion) })}>{OCCASION_LABEL[occasion]}</ToggleChip>)}</div></Field>
          <Field label="Orçamento por peça" hint={<span className="font-mono">até R$ {profile.budget}</span>}><input type="range" aria-label="Orçamento por peça" min={100} max={800} step={10} value={profile.budget} onChange={(event) => patch({ budget: Number(event.target.value) })} className="focus-clay h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary" /></Field>
        </div>
        {profile.palette.length ? <div className="mt-6"><Field label="Paleta identificada"><div className="flex flex-wrap gap-2">{profile.palette.map((hex) => <span key={hex} title={hex} className="size-8 rounded-full border border-line" style={{ backgroundColor: hex }} />)}</div></Field></div> : null}
        <div className="mt-8 flex flex-wrap gap-3"><Button onClick={onNext}>Salvar avatar e abrir marketplace</Button><Button variant="ghost" onClick={onBack}>Refazer escaneamento</Button></div>
      </Panel>
    </div>
  </div>;
}
