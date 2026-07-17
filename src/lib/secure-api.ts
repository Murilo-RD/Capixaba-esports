import { getAuthToken } from "@/lib/custom-auth";

export async function secureWrite<T = unknown>(action: string, payload: unknown): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new Error("Sessao expirada. Entre novamente.");

  const response = await fetch("/api/secure/write", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const data = (await response.json().catch(() => null)) as { error?: string; result?: T } | null;
  if (!response.ok) throw new Error(data?.error ?? "Erro ao salvar.");
  return data?.result as T;
}
