import { Button, Eyebrow, Field, MeasureField, Panel, ToggleChip } from "@/components/provador/primitives";
import { OCCASIONS, OCCASION_LABEL, STYLE_LABEL, STYLE_TAGS } from "@/data/catalog";
import {
  BODY_SHAPE_LABEL,
  type Body,
  type BodyShape,
  type FitPref,
  type StyleProfile,
} from "@/lib/sizing";

export type Audience = "feminino" | "masculino";

export type Profile = StyleProfile & { audience: Audience };

const FIT_OPTIONS: { value: FitPref; label: string; hint: string }[] = [
  { value: "justo", label: "Justo", hint: "marca o corpo" },
  { value: "acertado", label: "Acertado", hint: "como foi modelado" },
  { value: "solto", label: "Solto", hint: "com folga" },
];

const SHAPES: BodyShape[] = ["ampulheta", "triangle", "inverted", "retangulo", "oval"];

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function ProfileStep({
  body,
  profile,
  estimated,
  notes,
  confidence,
  onBody,
  onProfile,
  onBack,
  onNext,
}: {
  body: Body;
  profile: Profile;
  estimated: boolean;
  notes: string;
  confidence: number;
  onBody: (body: Body) => void;
  onProfile: (profile: Profile) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const set = <K extends keyof Body>(key: K, value: number) => onBody({ ...body, [key]: value });
  const patch = (next: Partial<Profile>) => onProfile({ ...profile, ...next });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
      <Panel className="p-6 sm:p-7">
        <Eyebrow>Passo 2 · medidas</Eyebrow>
        <h2 className="mt-3 font-serif text-3xl text-foreground">Confira o que a foto mostrou</h2>
        <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
          {notes || "Ajuste qualquer número que não bater com a fita métrica."}
        </p>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          confiança da análise {Math.round(confidence * 100)}%
        </p>

        <div className="measure-tape mt-5 grid gap-3 sm:grid-cols-2">
          <MeasureField label="Altura" value={body.heightCm} min={130} max={215} step={1} estimated={estimated} onChange={(v) => set("heightCm", v)} />
          <MeasureField label="Peso (kg)" value={body.weightKg} min={35} max={200} step={1} estimated={estimated} onChange={(v) => set("weightKg", v)} />
          <MeasureField label="Busto" value={body.chestCm} min={65} max={150} estimated={estimated} onChange={(v) => set("chestCm", v)} />
          <MeasureField label="Cintura" value={body.waistCm} min={55} max={150} estimated={estimated} onChange={(v) => set("waistCm", v)} />
          <MeasureField label="Quadril" value={body.hipsCm} min={65} max={160} estimated={estimated} onChange={(v) => set("hipsCm", v)} />
          <MeasureField label="Ombro" value={body.shoulderCm} min={30} max={60} estimated={estimated} onChange={(v) => set("shoulderCm", v)} />
          <MeasureField label="Entrepernas" value={body.inseamCm} min={55} max={105} estimated={estimated} onChange={(v) => set("inseamCm", v)} />
        </div>
      </Panel>

      <Panel className="p-6 sm:p-7">
        <Eyebrow>Passo 2 · estilo</Eyebrow>
        <h2 className="mt-3 font-serif text-3xl text-foreground">Como você gosta de vestir</h2>

        <div className="mt-6 space-y-6">
          <Field label="Peças">
            <div className="flex flex-wrap gap-2">
              {(["feminino", "masculino"] as Audience[]).map((value) => (
                <ToggleChip
                  key={value}
                  active={profile.audience === value}
                  onClick={() => patch({ audience: value })}
                >
                  {value}
                </ToggleChip>
              ))}
            </div>
          </Field>

          <Field label="Caimento preferido">
            <div className="flex flex-wrap gap-2">
              {FIT_OPTIONS.map((option) => (
                <ToggleChip
                  key={option.value}
                  active={profile.fitPref === option.value}
                  onClick={() => patch({ fitPref: option.value })}
                >
                  {option.label}
                  <span className="ml-1.5 text-xs opacity-70">{option.hint}</span>
                </ToggleChip>
              ))}
            </div>
          </Field>

          <Field label="Silhueta">
            <div className="flex flex-wrap gap-2">
              {SHAPES.map((shape) => (
                <ToggleChip
                  key={shape}
                  active={profile.shape === shape}
                  onClick={() => patch({ shape })}
                >
                  {BODY_SHAPE_LABEL[shape]}
                </ToggleChip>
              ))}
            </div>
          </Field>

          <Field label="Estilo">
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => (
                <ToggleChip
                  key={tag}
                  active={profile.styles.includes(tag)}
                  onClick={() => patch({ styles: toggle(profile.styles, tag) })}
                >
                  {STYLE_LABEL[tag]}
                </ToggleChip>
              ))}
            </div>
          </Field>

          <Field label="Ocasião">
            <div className="flex flex-wrap gap-2">
              {OCCASIONS.map((occasion) => (
                <ToggleChip
                  key={occasion}
                  active={profile.occasions.includes(occasion)}
                  onClick={() => patch({ occasions: toggle(profile.occasions, occasion) })}
                >
                  {OCCASION_LABEL[occasion]}
                </ToggleChip>
              ))}
            </div>
          </Field>

          <Field
            label="Orçamento por peça"
            hint={<span className="font-mono">até R$ {profile.budget}</span>}
          >
            <input
              type="range"
              aria-label="Orçamento por peça"
              min={100}
              max={800}
              step={10}
              value={profile.budget}
              onChange={(event) => patch({ budget: Number(event.target.value) })}
              className="focus-clay h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            />
          </Field>

          {profile.palette.length ? (
            <Field label="Cores que favorecem você">
              <div className="flex flex-wrap gap-2">
                {profile.palette.map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    className="size-8 rounded-full border border-line"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </Field>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={onNext}>Ver recomendações</Button>
          <Button variant="ghost" onClick={onBack}>
            Trocar a foto
          </Button>
        </div>
      </Panel>
    </div>
  );
}
