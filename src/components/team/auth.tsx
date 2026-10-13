import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { siteUrl } from "@/lib/site-config";

const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "Use uma senha com pelo menos 8 caracteres.").max(128),
});
const registration = credentials
  .extend({ nick: z.string().trim().min(2).max(40), confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    message: "As senhas precisam ser iguais.",
    path: ["confirm"],
  });
type AuthMode = "login" | "register" | "recover" | "password";

export function TeamAuth({
  recovery,
  onPasswordSaved,
}: {
  recovery: boolean;
  onPasswordSaved: () => void;
}) {
  const [selected, setSelected] = useState<AuthMode>("login");
  const mode = recovery ? "password" : selected;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const input = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      nick: String(form.get("nick") ?? ""),
      confirm: String(form.get("confirm") ?? ""),
    };
    try {
      if (mode === "recover") {
        const email = z.string().trim().email().parse(input.email);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: siteUrl("/team?recovery=1"),
        });
        if (error) throw error;
        setMessage(
          "Se houver uma conta com este e-mail, você receberá o link para redefinir a senha.",
        );
      } else if (mode === "password") {
        // A confirmação de senha é validada explicitamente para a recuperação.
        if (input.password !== input.confirm) throw new Error("As senhas precisam ser iguais.");
        z.string().min(8).max(128).parse(input.password);
        const { error } = await supabase.auth.updateUser({ password: input.password });
        if (error) throw error;
        onPasswordSaved();
        setMessage("Senha atualizada.");
      } else if (mode === "register") {
        const parsed = registration.parse(input);
        const { error } = await supabase.auth.signUp({
          email: parsed.email,
          password: parsed.password,
          options: { data: { nick: parsed.nick }, emailRedirectTo: siteUrl("/team") },
        });
        if (error) throw error;
        setMessage(
          "Solicitação enviada. Confirme seu e-mail, se solicitado, e aguarde a aprovação de um owner.",
        );
      } else {
        const parsed = z
          .object({ email: z.string().trim().email(), password: z.string().min(1).max(128) })
          .parse(input);
        const { error } = await supabase.auth.signInWithPassword(parsed);
        if (error) throw error;
      }
    } catch (error) {
      setError(
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join(" ")
          : error instanceof Error
            ? error.message
            : "Não foi possível autenticar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    login: "Entre na sua conta",
    register: "Peça acesso à equipe",
    recover: "Recuperar senha",
    password: "Criar uma nova senha",
  };
  return (
    <div className="team-auth">
      <div className="team-auth-story">
        <img src="/moonastery-icon.png" width="110" height="110" alt="Moonastery E-Sports" />
        <h1>
          Sua equipe.
          <br />
          Seu próximo passo.
        </h1>
        <p>Treinos, análises e planos em um só lugar.</p>
        <a href="/">Voltar ao site</a>
      </div>
      <section className="team-auth-box" aria-labelledby="auth-title">
        <p className="team-muted">Área da equipe</p>
        <h2 id="auth-title">{titles[mode]}</h2>
        {mode !== "password" && (
          <div className="team-auth-tabs">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => {
                setSelected("login");
                setError("");
                setMessage("");
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => {
                setSelected("register");
                setError("");
                setMessage("");
              }}
            >
              Cadastrar
            </button>
          </div>
        )}
        <form onSubmit={submit} className="team-form" aria-busy={busy}>
          {mode === "register" && (
            <label className="team-field">
              Nick
              <input name="nick" autoComplete="nickname" required minLength={2} maxLength={40} />
            </label>
          )}
          {mode !== "password" && (
            <label className="team-field">
              E-mail
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
          )}
          {mode !== "recover" && (
            <label className="team-field">
              Senha
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? 1 : 8}
                maxLength={128}
              />
            </label>
          )}
          {(mode === "register" || mode === "password") && (
            <label className="team-field">
              Confirmar senha
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="team-notice">
              {message}
            </p>
          )}
          <button className="team-button" disabled={busy} type="submit">
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar"
                : mode === "register"
                  ? "Solicitar cadastro"
                  : mode === "recover"
                    ? "Enviar link de recuperação"
                    : "Atualizar senha"}
          </button>
        </form>
        {mode === "login" && (
          <button className="team-text-button" onClick={() => setSelected("recover")}>
            Esqueci minha senha
          </button>
        )}
        {mode === "register" && (
          <p className="team-muted">
            Seu acesso aos recursos internos depende da aprovação de um owner.
          </p>
        )}
      </section>
    </div>
  );
}
