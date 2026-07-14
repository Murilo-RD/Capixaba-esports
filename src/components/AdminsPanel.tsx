import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";
import { listAdminUsers, setAdminRole } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminUser = {
  id: string;
  nick: string | null;
  email: string | null;
  status: string;
  created_at: string;
  roles: string[];
  isAdmin: boolean;
};

export function AdminsPanel() {
  const queryClient = useQueryClient();
  const listUsers = useServerFn(listAdminUsers);
  const setRole = useServerFn(setAdminRole);
  const [filter, setFilter] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await listUsers()) as AdminUser[],
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((user) =>
      [user.nick, user.email, user.status, user.id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  async function changeAdmin(user: AdminUser, admin: boolean) {
    setBusyUserId(user.id);
    try {
      await setRole({ data: { userId: user.id, admin } });
      toast.success(
        admin
          ? `${user.nick ?? user.email ?? "Usuário"} agora é admin.`
          : `${user.nick ?? user.email ?? "Usuário"} não é mais admin.`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar admin.");
    } finally {
      setBusyUserId(null);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Carregando usuários...</p>;

  if (error) {
    return (
      <p className="text-destructive">
        Erro ao carregar usuários: {(error as Error).message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Administradores
          </h2>
          <p className="text-sm text-muted-foreground">
            Defina quem pode acessar o painel de admin.
          </p>
        </div>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Buscar por nick, email ou ID..."
          className="sm:w-80 glass border-white/10"
        />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((user) => (
          <Card key={user.id} className="glass border-0">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">
                    {user.nick ?? user.email ?? "Usuário sem nome"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email ?? user.id}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                    user.isAdmin
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "border-white/10 text-muted-foreground bg-white/5"
                  }`}
                >
                  {user.isAdmin ? "Admin" : "Jogador"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Status: <span className="text-foreground">{user.status}</span>
              </div>
              {user.isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyUserId === user.id}
                  onClick={() => changeAdmin(user, false)}
                  className="w-full justify-center gap-2"
                >
                  <ShieldOff className="h-4 w-4" />
                  {busyUserId === user.id ? "Salvando..." : "Remover admin"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busyUserId === user.id}
                  onClick={() => changeAdmin(user, true)}
                  className="w-full justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {busyUserId === user.id ? "Salvando..." : "Tornar admin"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!filtered.length && (
        <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
      )}
    </div>
  );
}
