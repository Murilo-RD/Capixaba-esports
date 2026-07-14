import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/capixaba-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Capixaba E-Sports" }] }),
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: p } = await supabase.from("profiles").select("status").eq("id", data.session.user.id).maybeSingle();
      navigate({ to: p?.status === "aprovado" ? "/relatorio" : "/candidatura" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/candidatura`,
            data: { nick },
          },
        });
        if (error) throw error;

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            throw new Error(
              "Conta criada, mas o Supabase ainda está exigindo confirmação de email. Desative Confirm email em Authentication > Providers > Email.",
            );
          }
        }

        toast.success("Conta criada! Preencha sua candidatura.");
        navigate({ to: "/candidatura" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: u } = await supabase.auth.getUser();
        const { data: p } = await supabase.from("profiles").select("status").eq("id", u.user!.id).maybeSingle();
        navigate({ to: p?.status === "aprovado" ? "/relatorio" : "/candidatura" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro");
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
          <img src={logo} alt="Capixaba E-Sports" className="h-28 w-28 object-contain mb-2" />
          <CardTitle className="text-2xl">
            <span className="text-gradient">CAPIXABA</span> <span className="text-accent">E-SPORTS</span>
          </CardTitle>
          <CardDescription>
            {mode === "signin" ? "Entre para enviar seu relatório semanal" : "Crie sua conta de jogador"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="nick">Nick</Label>
                <Input id="nick" required value={nick} onChange={(e) => setNick(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
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
            {mode === "signin" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Voltar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
