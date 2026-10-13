import { supabase } from "@/integrations/supabase/client";
import type { MoonAction, MoonPayload } from "./schemas";
import type { PublicHome, PublicNews } from "./types";
export class MoonApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
async function result<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new MoonApiError(
      data.error || "Falha na solicitação.",
      data.code || "REQUEST_FAILED",
      response.status,
    );
  return data as T;
}
export async function moonRequest<T = unknown, A extends MoonAction = MoonAction>(
  action: A,
  payload: MoonPayload<A> = {} as MoonPayload<A>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new MoonApiError("Entre na área da equipe.", "UNAUTHENTICATED", 401);
  return result<T>(
    await fetch("/api/moonastery", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, payload }),
    }),
  );
}
export async function publicHome(): Promise<PublicHome> {
  return result<PublicHome>(await fetch("/api/moonastery?resource=home"));
}
export async function publicNews(slug: string): Promise<PublicNews> {
  return result<PublicNews>(
    await fetch(`/api/moonastery?resource=news&slug=${encodeURIComponent(slug)}`),
  );
}
