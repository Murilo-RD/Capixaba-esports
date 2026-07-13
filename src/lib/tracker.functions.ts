import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sincroniza o perfil do jogador com a Tracker Network (tracker.gg)
 * Requer a variável de ambiente TRN_API_KEY (chave gratuita do tracker.gg/developers)
 */
export const syncTrackerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: string; identifier: string }) => {
    const allowed = ["steam", "epic", "psn", "xbl", "switch"];
    if (!allowed.includes(input.platform)) {
      throw new Error(`Plataforma inválida. Use uma de: ${allowed.join(", ")}`);
    }
    if (!input.identifier || input.identifier.trim().length < 2) {
      throw new Error("ID do jogador inválido");
    }
    return { platform: input.platform, identifier: input.identifier.trim() };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.TRN_API_KEY ?? process.env.TRACKER_API_KEY ?? process.env.RLTRACKER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Integração com Tracker Network ainda não configurada. Peça ao administrador para adicionar a chave TRN_API_KEY (grátis em tracker.gg/developers)."
      );
    }

    const url = `https://public-api.tracker.gg/v2/rocket-league/standard/profile/${data.platform}/${encodeURIComponent(data.identifier)}`;
    const res = await fetch(url, {
      headers: {
        "TRN-Api-Key": apiKey,
        "Accept": "application/json",
        "User-Agent": "CapixabaESports/1.0",
      },
    });

    if (res.status === 404) {
      throw new Error("Jogador não encontrado no Tracker. Verifique a plataforma e o ID.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Chave/app ID da Tracker Network inválido ou sem permissão para a API.");
    }
    if (res.status === 429) {
      throw new Error("Muitas requisições — aguarde alguns segundos e tente novamente.");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tracker Network respondeu ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      data?: {
        platformInfo?: { avatarUrl?: string | null };
        segments?: Array<{
          type?: string;
          metadata?: { name?: string };
          stats?: {
            rating?: { value?: number | null };
            tier?: { metadata?: { name?: string | null } };
          };
        }>;
      };
    };

    const segments = json?.data?.segments ?? [];
    const avatarUrl = json?.data?.platformInfo?.avatarUrl ?? null;

    function pick(playlistName: string) {
      const s = segments.find(
        (seg) =>
          seg.type === "playlist" &&
          (seg.metadata?.name ?? "").toLowerCase().includes(playlistName.toLowerCase())
      );
      const mmr = s?.stats?.rating?.value ?? null;
      const rank = s?.stats?.tier?.metadata?.name ?? null;
      return { mmr: mmr != null ? Math.round(mmr) : null, rank };
    }

    const duel = pick("Ranked Duel");
    const doubles = pick("Ranked Doubles");
    const standard = pick("Ranked Standard");

    const update = {
      platform: data.platform,
      rocket_league_id: data.identifier,
      avatar_url: avatarUrl,
      mmr_1v1: duel.mmr,
      rank_1v1: duel.rank,
      mmr_2v2: doubles.mmr,
      rank_2v2: doubles.rank,
      mmr_3v3: standard.mmr,
      rank_3v3: standard.rank,
      tracker_synced_at: new Date().toISOString(),
    };

    const { error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return update;
  });
