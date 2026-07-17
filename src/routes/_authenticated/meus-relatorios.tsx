import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/custom-auth";
import { secureWrite } from "@/lib/secure-api";
import { AppShell } from "@/components/AppShell";
import { ReportCard } from "@/components/ReportCard";
import { PlayerEvolutionChart } from "@/components/PlayerEvolutionChart";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["weekly_reports"]["Row"];

export const Route = createFileRoute("/_authenticated/meus-relatorios")({
  component: MyReports,
});

function MyReports() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-reports"],
    queryFn: async () => {
      const user = getCurrentUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("weekly_reports").select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Report[];
    },
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await secureWrite("reports.delete", { id: toDelete.id });
      toast.success("Relatório excluído.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["my-reports"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl sm:text-3xl font-black mb-5 sm:mb-6">
        Meus <span className="text-gradient">relatórios</span>
      </h1>

      {!isLoading && (data?.length ?? 0) > 0 && (
        <div className="mb-6">
          <PlayerEvolutionChart reports={data ?? []} />
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <p className="text-muted-foreground">Você ainda não enviou nenhum relatório.</p>
      )}
      <div className="grid gap-4">
        {data?.map((r) => (
          <ReportCard
            key={r.id} r={r}
            onEdit={(rep) => navigate({ to: "/relatorio", search: { id: rep.id } })}
            onDelete={(rep) => setToDelete(rep)}
          />
        ))}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && <>Esta ação não pode ser desfeita. O relatório da semana <strong>{toDelete.semana}</strong> será removido.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
