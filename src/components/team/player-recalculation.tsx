import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moonRequest } from "@/lib/moonastery/client";
import type { Player } from "@/lib/moonastery/types";

export function PlayerRecalculation({ players }: { players: Player[] }) {
  const [selectedId, setSelectedId] = useState("");
  const cache = useQueryClient();
  const selected =
    players.length === 1 ? players[0] : players.find((player) => player.id === selectedId);
  const mutation = useMutation({
    mutationFn: (id: string) =>
      moonRequest<{ replays: number; reports: number }>("players.recalculate", { id }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["moon-team"] }),
  });
  return (
    <div className="team-form">
      {players.length > 1 && (
        <label className="team-field">
          Jogador para recalcular
          <select
            value={selectedId}
            disabled={mutation.isPending}
            onChange={(event) => {
              setSelectedId(event.target.value);
              mutation.reset();
            }}
          >
            <option value="">Selecione um jogador</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.nick}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="team-muted">
        Usa o baseline atual em todos os modos. Replays aprovados atualizam a carta, o ranking e os
        relatórios; análises pendentes continuam aguardando aprovação. As observações são
        preservadas.
      </p>
      <button
        type="button"
        className="team-button team-button-secondary"
        disabled={!selected?.platform || !selected.platform_id || mutation.isPending}
        onClick={() => {
          if (
            selected &&
            window.confirm(
              `Recalcular todos os replays analisados de ${selected.nick} com a configuração atual? A carta e os relatórios aprovados serão atualizados, sem duplicar partidas.`,
            )
          )
            mutation.mutate(selected.id);
        }}
      >
        {mutation.isPending ? "Recalculando métricas…" : "Recalcular métricas do jogador"}
      </button>
      {mutation.isPending && (
        <p role="status">Buscando os replays e recalculando. Aguarde a conclusão.</p>
      )}
      {selected && (!selected.platform || !selected.platform_id) && (
        <p className="team-muted">Cadastre a plataforma e o ID da conta para recalcular.</p>
      )}
      {mutation.error && (
        <p role="alert" className="team-error">
          {mutation.error.message}
        </p>
      )}
      {mutation.data && (
        <p role="status">
          Recálculo concluído: {mutation.data.replays} replay(s) e {mutation.data.reports}{" "}
          relatório(s) atualizado(s).
        </p>
      )}
    </div>
  );
}
