import { parseBallchasingReplay, ProviderPendingError } from "./parser";
import type { ParsedReplay } from "./parser";

export interface ReplayProvider {
  upload(bytes: Uint8Array, filename: string): Promise<{ id: string; duplicate: boolean }>;
  getReplay(id: string): Promise<ParsedReplay>;
}
export function validateReplayFile(bytes: Uint8Array, filename: string): void {
  if (
    !filename.toLowerCase().endsWith(".replay") ||
    filename.length > 200 ||
    /[/\\]/.test(filename) ||
    Array.from(filename).some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("Envie um arquivo .replay com nome válido.");
  if (bytes.byteLength < 16 || bytes.byteLength > 20 * 1024 * 1024)
    throw new Error("O replay deve ter entre 16 bytes e 20 MB.");
  // Rocket League replay binary starts with a little-endian header length and CRC.
  const headerSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
    true,
  );
  if (headerSize === 0 || headerSize > bytes.byteLength - 8)
    throw new Error("Cabeçalho binário de replay inválido.");
}
export class BallchasingProvider implements ReplayProvider {
  private readonly fetcher: typeof fetch;
  private readonly timeout: number;
  constructor(
    private readonly token: string,
    options: { fetcher?: typeof fetch; timeout_ms?: number } = {},
  ) {
    if (!token.trim())
      throw new Error("Configure BALLCHASING_API_TOKEN no servidor para analisar replays.");
    this.fetcher = options.fetcher ?? fetch;
    this.timeout = options.timeout_ms ?? 12000;
  }
  private async request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(`https://ballchasing.com/api/${path}`, {
          ...init,
          headers: { ...init.headers, Authorization: this.token },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "error",
        });
        if (response.status === 429) {
          const retry = response.headers.get("Retry-After"),
            numeric = Number(retry);
          const delay =
            retry !== null && Number.isFinite(numeric)
              ? numeric * 1000
              : retry
                ? Date.parse(retry) - Date.now()
                : 30000;
          throw new ProviderPendingError(
            "Limite do Ballchasing atingido. Tente processar novamente após a espera.",
            Math.max(1000, Math.min(3600000, Number.isFinite(delay) ? delay : 30000)),
          );
        }
        if (response.status === 202) throw new ProviderPendingError();
        if (response.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return response;
      } catch (error) {
        if (error instanceof ProviderPendingError) throw error;
        if (attempt === 1)
          throw new Error("Ballchasing indisponível ou requisição excedeu o tempo limite.");
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error("Ballchasing indisponível.");
  }
  async upload(bytes: Uint8Array, filename: string): Promise<{ id: string; duplicate: boolean }> {
    validateReplayFile(bytes, filename);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      filename,
    );
    const response = await this.request("v2/upload?visibility=private", {
      method: "POST",
      body: form,
    });
    if (response.status !== 201 && response.status !== 409)
      throw new Error(`Upload recusado pelo Ballchasing (HTTP ${response.status}).`);
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id))
      throw new Error("Ballchasing retornou identificação inválida.");
    return { id: body.id, duplicate: response.status === 409 };
  }
  async getReplay(id: string): Promise<ParsedReplay> {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("Identificação Ballchasing inválida.");
    const response = await this.request(`replays/${encodeURIComponent(id)}`, { method: "GET" });
    if (!response.ok)
      throw new Error(`Consulta ao Ballchasing recusada (HTTP ${response.status}).`);
    const replay = parseBallchasingReplay(await response.json());
    if (replay.provider_replay_id !== id)
      throw new Error("Resposta Ballchasing não corresponde ao replay solicitado.");
    return replay;
  }
}
