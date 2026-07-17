import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

const registerSchema = credentialsSchema.extend({
  nick: z.string().trim().min(2).max(40),
});

type AuthRow = {
  id: string;
  email: string;
  nick: string | null;
  status: Database["public"]["Enums"]["application_status"] | null;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAuthDbClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const SUPABASE_KEY = SUPABASE_SERVER_KEY || SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_KEY ? ["SUPABASE_PUBLISHABLE_KEY ou SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Configure ${missing.join(", ")} no Render e no .env local.`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function signAppJwt(user: AuthRow): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Configure SUPABASE_JWT_SECRET no Render e no .env local.");
  }

  const { createHmac } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: user.id,
    email: user.email,
    app_metadata: {},
    user_metadata: { nick: user.nick },
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function formatDbAuthError(error: { message?: string } | null): Error {
  const message = error?.message ?? "Erro ao autenticar.";
  const normalized = message.toLowerCase();

  if (normalized.includes("email_exists")) {
    return new Error("Esse email ja esta cadastrado. Entre na sua conta.");
  }
  if (normalized.includes("invalid_credentials")) {
    return new Error("Email ou senha incorretos.");
  }
  if (normalized.includes("password_too_short") || normalized.includes("password")) {
    return new Error("A senha precisa ter pelo menos 6 caracteres.");
  }
  if (normalized.includes("invalid_email")) {
    return new Error("Informe um email valido.");
  }
  if (normalized.includes("nick_too_short")) {
    return new Error("Informe um nick com pelo menos 2 caracteres.");
  }
  if (normalized.includes("user not allowed") || normalized.includes("permission denied")) {
    return new Error("Cadastro sem permissao no banco. Configure SUPABASE_SERVICE_ROLE_KEY no Render e rode a migration de autenticacao propria.");
  }

  return new Error(message);
}

async function createAuthResponse(user: AuthRow) {
  const token = await signAppJwt(user);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      nick: user.nick,
      status: user.status,
    },
  };
}

export const registerWithAppAuth = createServerFn({ method: "POST" })
  .inputValidator((data) => registerSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = createAuthDbClient();
    const { data: user, error } = await (supabase.rpc as any)("app_register", {
      _email: data.email,
      _password: data.password,
      _nick: data.nick,
    }).maybeSingle();

    if (error) throw formatDbAuthError(error);
    if (!user) throw new Error("Nao foi possivel criar a conta.");

    return createAuthResponse(user as AuthRow);
  });

export const loginWithAppAuth = createServerFn({ method: "POST" })
  .inputValidator((data) => credentialsSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = createAuthDbClient();
    const { data: user, error } = await (supabase.rpc as any)("app_login", {
      _email: data.email,
      _password: data.password,
    }).maybeSingle();

    if (error) throw formatDbAuthError(error);
    if (!user) throw new Error("Email ou senha incorretos.");

    return createAuthResponse(user as AuthRow);
  });
