import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moonRequest } from "@/lib/moonastery/client";
import { scoringConfigSchema } from "@/lib/gameplay-scouter/config";
import { PLAYLISTS, playlistLabel } from "@/lib/gameplay-scouter/baseline";
import type { ReferencePreview } from "@/lib/gameplay-scouter/baseline";
import type { DashboardData } from "@/lib/moonastery/types";

export function BaselineSettings({ data }: { data: DashboardData }) {
  const config = scoringConfigSchema.safeParse(data.scoring);
  const saved = config.success ? config.data.reference_player : null;
  const genericActive =
    config.success &&
    (config.data.baseline?.cohort === "GENERIC" ||
      config.data.baselines?.some((entry) => entry.cohort === "GENERIC"));
  const [playerId, setPlayerId] = useState(saved?.player_id ?? "");
  const [minSamples, setMinSamples] = useState(saved?.min_samples ?? 5);
  const cache = useQueryClient();
  const players = data.players.filter((player) => player.platform && player.platform_id);
  const selected = players.find((player) => player.id === playerId);
  const valid =
    Boolean(selected) && Number.isInteger(minSamples) && minSamples >= 2 && minSamples <= 100;
  const preview = useQuery({
    queryKey: [
      "moon-team",
      "baseline-preview",
      playerId,
      minSamples,
      data.jobs.map((job) => job.updated_at).join(","),
    ],
    queryFn: () =>
      moonRequest<ReferencePreview>("scoring.reference.preview", {
        player_id: playerId,
        min_samples: minSamples,
      }),
    enabled: valid,
    retry: false,
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: () =>
      moonRequest<ReferencePreview>("scoring.reference.save", {
        player_id: playerId,
        min_samples: minSamples,
      }),
    onSuccess: () => {
      toast.success("Jogador de referência salvo para todos os modos.");
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
    },
  });
  const clear = useMutation({
    mutationFn: () => moonRequest("scoring.reference.clear"),
    onSuccess: () => {
      setPlayerId("");
      toast.success("Referência por jogador desativada.");
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
    },
  });
  const generic = useMutation({
    mutationFn: (enabled: boolean) =>
      moonRequest(enabled ? "scoring.generic.enable" : "scoring.generic.disable"),
    onSuccess: (_, enabled) => {
      toast.success(
        enabled ? "Parâmetro genérico temporário ativado." : "Parâmetro genérico desativado.",
      );
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
    },
  });
  const modeIds = [
    ...new Set([
      ...PLAYLISTS.map(([id]) => id),
      ...(preview.data?.modes.map((mode) => mode.playlist) ?? []),
    ]),
  ];
  return (
    <div>
      <div className="team-list-item">
        <h3>Parâmetro genérico temporário</h3>
        <p className="team-muted">
          Uma referência provisória para todos os modos enquanto você reúne replays. Os valores são
          parâmetros iniciais, sem amostras coletadas e sem classificação SSL. Referências medidas
          por modo têm prioridade quando disponíveis.
        </p>
        <p role="status">
          {genericActive
            ? "Parâmetro genérico ativo nos modos sem referência medida."
            : "Parâmetro genérico desativado."}
        </p>
        <div className="team-actions">
          <button
            type="button"
            className="team-button team-button-secondary"
            disabled={generic.isPending || save.isPending || clear.isPending}
            onClick={() => generic.mutate(!genericActive)}
          >
            {generic.isPending
              ? "Salvando…"
              : genericActive
                ? "Desativar parâmetro genérico"
                : "Usar parâmetro genérico em todos os modos"}
          </button>
          <a
            className="team-text-button"
            href="/config/gameplay-scouter-generic-all-modes.json"
            download
          >
            Baixar configuração genérica (JSON)
          </a>
        </div>
        {generic.error && (
          <p className="team-error" role="alert">
            {generic.error.message}
          </p>
        )}
      </div>
      <p className="team-muted">
        {saved
          ? `Referência atual: ${saved.nick} (${saved.platform}: ${saved.platform_id}).`
          : "Nenhum jogador de referência selecionado."}
      </p>
      <form
        className="team-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
        aria-busy={save.isPending}
      >
        <div className="team-field">
          <label htmlFor="baseline-player-id">ID do jogador de referência</label>
          <select
            id="baseline-player-id"
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
            required
            aria-describedby="baseline-player-help"
          >
            <option value="">Escolha um jogador cadastrado</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.nick} — {player.platform}: {player.platform_id}
              </option>
            ))}
          </select>
          <p id="baseline-player-help" className="team-muted">
            {selected
              ? `ID selecionado: ${selected.platform}: ${selected.platform_id}`
              : "Escolha a conta Steam, Epic Games ou PlayStation cadastrada no perfil."}
          </p>
        </div>
        <div className="team-field">
          <label htmlFor="baseline-min-samples">Mínimo de partidas por modo</label>
          <input
            id="baseline-min-samples"
            type="number"
            min={2}
            max={100}
            step={1}
            value={minSamples}
            onChange={(event) => setMinSamples(Number(event.target.value))}
            required
            aria-describedby="baseline-samples-help"
          />
          <p id="baseline-samples-help" className="team-muted">
            Padrão: 5 partidas por modo. Mínimo: 2. Partidas repetidas contam uma única vez.
          </p>
        </div>
        {!players.length && (
          <p className="team-empty">
            Cadastre a plataforma e o ID no perfil de um integrante para poder selecioná-lo.
          </p>
        )}
        <p className="team-muted">
          Um jogador para todos os modos. A referência é calculada por modalidade e atualizada com
          novos replays. Modos sem amostra suficiente aguardam partidas desse jogador.
        </p>
        <p className="team-muted">
          Referência individual; o rank SSL não é verificado automaticamente.
        </p>
        {preview.isFetching && <p role="status">Consultando os replays do jogador…</p>}
        {(preview.error || save.error || clear.error) && (
          <p className="team-error" role="alert">
            {(save.error ?? clear.error ?? preview.error)?.message}
          </p>
        )}
        {preview.data && (
          <div className="min-w-0">
            <p role="status">
              {preview.data.baselines.length}{" "}
              {preview.data.baselines.length === 1
                ? "modo com referência disponível."
                : "modos com referência disponível."}
            </p>
            {preview.data.legacy_samples > 0 && (
              <p className="team-muted">
                {preview.data.legacy_samples} replay(s) antigo(s) sem tempo de participação
                confirmado foram excluídos. Confirme o acesso ao Ballchasing no servidor e tente
                novamente se o provedor estiver limitando as consultas, ou processe novos replays.
              </p>
            )}
            {preview.data.truncated && (
              <p className="team-muted">
                A referência considera até 199 partidas recentes do jogador.
              </p>
            )}
            <details>
              <summary>Ver disponibilidade por modo de jogo</summary>
              <div className="team-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Modo</th>
                      <th>Partidas válidas</th>
                      <th>Métricas</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modeIds.map((playlist) => {
                      const mode = preview.data.modes.find((item) => item.playlist === playlist);
                      return (
                        <tr key={playlist}>
                          <td>{playlistLabel(playlist)}</td>
                          <td>
                            {mode?.matches ?? 0} / {minSamples}
                          </td>
                          <td>{mode?.metrics ?? 0}</td>
                          <td>
                            {mode?.ready
                              ? "Referência disponível"
                              : "Aguardando amostras com variação"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
        <div className="team-actions">
          <button
            className="team-button"
            type="submit"
            disabled={!valid || save.isPending || clear.isPending || generic.isPending}
          >
            {save.isPending ? "Salvando…" : "Usar este jogador em todos os modos"}
          </button>
          {saved && (
            <button
              className="team-button team-button-secondary"
              type="button"
              disabled={save.isPending || clear.isPending || generic.isPending}
              onClick={() => clear.mutate()}
            >
              Desativar referência por jogador
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
