import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/capixaba-logo.png";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, saveAuthSession } from "@/lib/custom-auth";

type AuthSession = {
  token: string;
  user: {
    id: string;
    email: string;
    nick: string | null;
    status: string | null;
  };
};

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar - Capixaba E-Sports" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nick, setNick] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      navigate({
        to: user.status === "aprovado" ? "/relatorio" : "/candidatura",
      });
    }
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const created = await postAuth("/api/auth/register", { email, password, nick });
        saveAuthSession(created.token, created.user);
        toast.success("Conta criada! Preencha sua candidatura.");
        navigate({ to: "/candidatura" });
        return;
      }

      const session = await postAuth("/api/auth/login", { email, password });
      saveAuthSession(session.token, session.user);
      navigate({
        to: session.user.status === "aprovado" ? "/relatorio" : "/candidatura",
      });
    } catch (err) {
      toast.error(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 -left-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -right-32 w-96 h-96 rounded-full bg-accent/30 blur-3xl pointer-events-none" />
      <Card className="w-full max-w-md relative z-10 animate-fade-in">
        <CardHeader className="items-center text-center">
          <img
            src={logo}
            alt="Capixaba E-Sports"
            className="h-28 w-28 object-contain mb-2"
          />
          <CardTitle className="text-2xl">
            <span className="text-gradient">CAPIXABA</span>{" "}
            <span className="text-accent">E-SPORTS</span>
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Entre para enviar seu relatorio semanal"
              : "Crie sua conta de jogador"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="nick">Nick</Label>
                <Input
                  id="nick"
                  required
                  value={nick}
                  onChange={(event) => setNick(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground w-full text-center"
          >
            {mode === "signin" ? "Nao tem conta? Criar uma" : "Ja tem conta? Entrar"}
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              Voltar
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function postAuth(path: string, payload: Record<string, string>): Promise<AuthSession> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as { error?: string } | AuthSession | null;
  if (!response.ok) {
    throw new Error((data && "error" in data && data.error) || "Erro ao autenticar.");
  }

  if (!data || !("token" in data)) {
    throw new Error("Resposta invalida do servidor.");
  }

  return data;
}

function formatAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro ao autenticar.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("invalid_credentials") ||
    normalized.includes("email ou senha")
  ) {
    return "Email ou senha incorretos.";
  }

  if (
    normalized.includes("already registered") ||
    normalized.includes("user already") ||
    normalized.includes("already exists")
  ) {
    return "Esse email ja esta cadastrado. Entre na sua conta.";
  }

  if (normalized.includes("password")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  return message;
}
