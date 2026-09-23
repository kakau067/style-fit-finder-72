import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button, ErrorNote, Eyebrow, Panel } from "@/components/provador/primitives";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Área do lojista | Provador Virtual" },
      {
        name: "description",
        content: "Acesso do lojista para cadastrar peças, fotos e tamanhos do catálogo.",
      },
      { property: "og:title", content: "Entrar — Área do lojista" },
      { property: "og:description", content: "Acesso do lojista ao catálogo do provador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/admin-lojista" });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin-lojista" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submitEmail() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "entrar") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (!data.session) {
          setInfo("Confira seu e-mail para confirmar o cadastro. Depois volte aqui e entre com sua senha.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível criar a conta.";
      setError(message === "Email rate limit exceeded"
        ? "Muitos e-mails enviados. Aguarde alguns minutos antes de tentar novamente."
        : message);
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) setError("Não foi possível entrar com o Google.");
  }

  const inputClass =
    "focus-clay w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <Panel className="w-full max-w-md p-7 sm:p-9">
        <Eyebrow>Área do lojista</Eyebrow>
        <h1 className="mt-2 font-serif text-3xl text-foreground">
          {mode === "entrar" ? "Entrar no ateliê" : "Criar acesso do lojista"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "entrar"
            ? "Entre para cadastrar peças, fotos e tabelas de medidas."
            : "A primeira conta criada vira a administradora do catálogo."}
        </p>

        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmail();
          }}
        >
          <input
            type="email"
            required
            placeholder="voce@saloja.com.br"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
            aria-label="E-mail"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Senha (mínimo 6 caracteres)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
            aria-label="Senha"
          />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {info ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-secondary-foreground">
              {info}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ou
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button variant="outline" className="w-full" onClick={() => void submitGoogle()}>
          Continuar com Google
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "entrar" ? "cadastrar" : "entrar");
            setError(null);
            setInfo(null);
          }}
          className="focus-clay mt-5 w-full text-center text-sm text-secondary-foreground underline underline-offset-4"
        >
          {mode === "entrar" ? "Ainda não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </Panel>
    </div>
  );
}
