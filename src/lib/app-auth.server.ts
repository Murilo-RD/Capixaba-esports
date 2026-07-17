import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

export const registerSchema = credentialsSchema.extend({
  nick: z.string().trim().min(2).max(40),
});

export type AuthSession = {
  token: string;
  user: {
    id: string;
    email: string;
    nick: string | null;
    status: Database["public"]["Enums"]["application_status"] | null;
  };
};

type AuthRow = AuthSession["user"];

export type AppAuthClaims = {
  aud?: string;
  role?: string;
  sub?: string;
  email?: string;
  exp?: number;
};

type AppAuthUserRow = {
  id: string;
  email: string;
  nick: string;
  password_hash: string;
};

export function createAuthDbClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVER_KEY ? ["SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY"] : []),
    ];
    throw new Error(`Configure ${missing.join(", ")} no Render e no .env local.`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVER_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getBootstrapAdminEmails(): Set<string> {
  const configured = process.env.BOOTSTRAP_ADMIN_EMAILS ?? "";
  return new Set(
    ["murilo.dhu@gmail.com", ...configured.split(",")]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Configure SUPABASE_JWT_SECRET no Render e no .env local.");
  }
  return secret;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export async function verifyAppToken(token: string): Promise<AppAuthClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Sessao invalida.");

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", getJwtSecret()).update(unsigned).digest();
  const received = base64UrlDecode(parts[2]);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Sessao invalida.");
  }

  const claims = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as AppAuthClaims;
  if (!claims.sub || claims.role !== "authenticated") throw new Error("Sessao invalida.");
  if (!claims.exp || claims.exp * 1000 <= Date.now()) throw new Error("Sessao expirada.");
  return claims;
}

export async function hashPassword(password: string): Promise<string> {
  const { pbkdf2, randomBytes } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const pbkdf2Async = promisify(pbkdf2);
  const iterations = 210_000;
  const salt = randomBytes(16).toString("base64url");
  const derived = await pbkdf2Async(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 100_000) return false;

  const { pbkdf2, timingSafeEqual } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const pbkdf2Async = promisify(pbkdf2);
  const expected = Buffer.from(parts[3], "base64url");
  const actual = await pbkdf2Async(password, parts[2], iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function signAppJwt(user: AuthRow): Promise<string> {
  const secret = getJwtSecret();
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

export function formatAuthError(error: { message?: string } | null): Error {
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
    return new Error("Cadastro sem permissao no banco. Configure SUPABASE_SERVICE_ROLE_KEY no Render.");
  }
  if (
    normalized.includes("app_auth_users") ||
    normalized.includes("does not exist") ||
    normalized.includes("foreign key constraint")
  ) {
    return new Error("Banco ainda nao esta preparado para o login proprio. Rode as migrations novas no SQL Editor do Supabase.");
  }

  return new Error(message);
}

async function createAuthResponse(user: AuthRow): Promise<AuthSession> {
  const token = await signAppJwt(user);
  return { token, user };
}

async function ensureBootstrapAdminRole(
  supabase: ReturnType<typeof createAuthDbClient>,
  userId: string,
  email: string,
) {
  if (!getBootstrapAdminEmails().has(normalizeEmail(email))) return;

  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "owner" }, { onConflict: "user_id,role", ignoreDuplicates: true });

  if (error) throw formatAuthError(error);
}

async function getProfileStatus(
  supabase: ReturnType<typeof createAuthDbClient>,
  user: AppAuthUserRow,
): Promise<AuthRow> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("nick,status")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw formatAuthError(error);

  return {
    id: user.id,
    email: user.email,
    nick: profile?.nick ?? user.nick,
    status: profile?.status ?? "pendente",
  };
}

export async function registerAppUser(input: z.infer<typeof registerSchema>): Promise<AuthSession> {
  getJwtSecret();
  const supabase = createAuthDbClient();
  const email = normalizeEmail(input.email);
  const nick = input.nick.trim();

  const { data: existing, error: existingError } = await (supabase as any)
    .from("app_auth_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) throw formatAuthError(existingError);
  if (existing) throw new Error("Esse email ja esta cadastrado. Entre na sua conta.");

  const passwordHash = await hashPassword(input.password);
  const { data: created, error: createError } = await (supabase as any)
    .from("app_auth_users")
    .insert({ email, password_hash: passwordHash, nick })
    .select("id,email,nick,password_hash")
    .single();

  if (createError) throw formatAuthError(createError);
  if (!created) throw new Error("Nao foi possivel criar a conta.");

  const user = created as AppAuthUserRow;

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, nick: user.nick, status: "pendente" }, { onConflict: "id" });

  if (profileError) {
    await (supabase as any).from("app_auth_users").delete().eq("id", user.id);
    throw formatAuthError(profileError);
  }

  const { error: roleError } = await supabase
    .from("user_roles")
    .upsert({ user_id: user.id, role: "player" }, { onConflict: "user_id,role", ignoreDuplicates: true });

  if (roleError) {
    await (supabase as any).from("app_auth_users").delete().eq("id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);
    throw formatAuthError(roleError);
  }

  await ensureBootstrapAdminRole(supabase, user.id, user.email);

  return createAuthResponse({
    id: user.id,
    email: user.email,
    nick: user.nick,
    status: "pendente",
  });
}

export async function loginAppUser(input: z.infer<typeof credentialsSchema>): Promise<AuthSession> {
  getJwtSecret();
  const supabase = createAuthDbClient();
  const email = normalizeEmail(input.email);

  const { data: user, error } = await (supabase as any)
    .from("app_auth_users")
    .select("id,email,nick,password_hash")
    .eq("email", email)
    .maybeSingle();

  if (error) throw formatAuthError(error);
  if (!user) throw new Error("Email ou senha incorretos.");

  const appUser = user as AppAuthUserRow;
  const valid = await verifyPassword(input.password, appUser.password_hash);
  if (!valid) {
    const { data: rpcUser, error: rpcError } = await (supabase.rpc as any)("app_login", {
      _email: input.email,
      _password: input.password,
    }).maybeSingle();

    if (rpcError || !rpcUser) throw new Error("Email ou senha incorretos.");

    const newHash = await hashPassword(input.password);
    await (supabase as any)
      .from("app_auth_users")
      .update({ password_hash: newHash })
      .eq("id", (rpcUser as AuthRow).id);

    await ensureBootstrapAdminRole(supabase, (rpcUser as AuthRow).id, (rpcUser as AuthRow).email);
    return createAuthResponse(rpcUser as AuthRow);
  }

  await ensureBootstrapAdminRole(supabase, appUser.id, appUser.email);
  return createAuthResponse(await getProfileStatus(supabase, appUser));
}
