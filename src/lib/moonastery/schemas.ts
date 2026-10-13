import { z } from "zod";
const id = z.string().uuid();
const text = z.string().trim().max(10000);
const title = z.string().trim().min(1).max(200);
const url = z
  .string()
  .url()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "Use uma URL HTTP ou HTTPS.");
const optionalUrl = url.nullable();
const role = z.enum(["owner", "editor", "coach", "player"]);
const empty = z.object({}).strict();
const identifier = z.object({ id }).strict();
const editableId = { id: id.optional() };
export const weightsSchema = z
  .object({
    VEL: z.number().min(0).max(1),
    FIN: z.number().min(0).max(1),
    CRI: z.number().min(0).max(1),
    DEF: z.number().min(0).max(1),
    POS: z.number().min(0).max(1),
    BST: z.number().min(0).max(1),
    IMP: z.number().min(0).max(1),
  })
  .strict()
  .refine(
    (v) => Math.abs(Object.values(v).reduce((a, b) => a + b, 0) - 1) < 0.00001,
    "Os pesos devem somar 1.",
  );
export const attributesSchema = z
  .object({
    VEL: z.number().min(0).max(99).nullable(),
    FIN: z.number().min(0).max(99).nullable(),
    CRI: z.number().min(0).max(99).nullable(),
    DEF: z.number().min(0).max(99).nullable(),
    POS: z.number().min(0).max(99).nullable(),
    BST: z.number().min(0).max(99).nullable(),
    IMP: z.number().min(0).max(99).nullable(),
  })
  .strict();
export const actionSchemas = {
  "membership.me": empty,
  "dashboard.get": z.object({ offset: z.number().int().min(0).max(100000).optional() }).strict(),
  "users.update": z
    .object({
      id,
      role: role.nullable(),
      status: z.enum(["pending", "approved", "rejected", "suspended"]),
    })
    .strict()
    .refine((v) => v.status !== "approved" || v.role !== null, "A aprovação exige uma função."),
  "users.create": z.object({ email: z.string().email().max(254), nick: title, role }).strict(),
  "users.remove": identifier,
  "profile.update": z.object({ nick: title, bio: text, photo_url: optionalUrl }).strict(),
  "players.update": z
    .object({
      id,
      nick: title,
      bio: text,
      game_id: id.nullable(),
      platform: z.enum(["steam", "epic"]).nullable(),
      platform_id: z.string().trim().min(1).max(128).nullable(),
      public_visible: z.boolean(),
    })
    .strict()
    .refine(
      (v) => Boolean(v.platform) === Boolean(v.platform_id),
      "Informe plataforma e identificação juntas.",
    ),
  "players.archetype": z.object({ id, archetype_id: id }).strict(),
  "reports.feedback": z
    .object({
      id,
      positives: text,
      improvements: text,
      instructions: text,
      objectives: text,
      recommendations: text,
      observations: text,
    })
    .strict(),
  "instructions.save": z
    .object({
      ...editableId,
      title,
      description: text,
      content: text,
      category: title,
      tactical: z.boolean(),
      target_player_ids: z.array(id).max(100),
      media: z.array(z.object({ type: z.enum(["image", "video", "link"]), url }).strict()).max(20),
    })
    .strict(),
  "instructions.delete": identifier,
  "news.save": z
    .object({
      ...editableId,
      title,
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(160),
      summary: z.string().max(600),
      content: z.string().min(1).max(100000),
      cover_url: optionalUrl,
      category: title,
    })
    .strict(),
  "news.submit": identifier,
  "news.review": z
    .object({
      id,
      status: z.enum(["published", "changes_requested", "rejected"]),
      review_note: text,
    })
    .strict(),
  "news.delete": identifier,
  "submissions.create": z
    .object({
      category: z.enum(["suggestion", "technical", "complaint", "other"]),
      title,
      description: z.string().trim().min(1).max(10000),
    })
    .strict(),
  "submissions.update": z
    .object({ id, status: z.enum(["open", "reviewing", "resolved", "dismissed"]), response: text })
    .strict(),
  "partners.save": z
    .object({
      ...editableId,
      name: title,
      description: text,
      logo_url: optionalUrl,
      url: optionalUrl,
      active: z.boolean(),
      display_order: z.number().int().min(0).max(10000),
    })
    .strict(),
  "partners.delete": identifier,
  "socials.save": z
    .object({
      ...editableId,
      platform: title,
      icon: z.string().max(50),
      url,
      active: z.boolean(),
      display_order: z.number().int().min(0).max(10000),
    })
    .strict(),
  "socials.delete": identifier,
  "games.save": z
    .object({
      ...editableId,
      name: title,
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(100),
      description: text,
      image_url: optionalUrl,
      active: z.boolean(),
      display_order: z.number().int().min(0).max(10000),
    })
    .strict(),
  "games.delete": identifier,
  "archetypes.save": z
    .object({
      ...editableId,
      name: title,
      description: text,
      weights: weightsSchema,
      active: z.boolean(),
    })
    .strict(),
  "archetypes.delete": identifier,
  "organization.save": z
    .object({
      name: title,
      description: text,
      hero_title: title,
      hero_subtitle: text,
      contact_email: z.string().email().nullable(),
    })
    .strict(),
  "scoring.save": z.object({ config: z.record(z.unknown()) }).strict(),
  "jobs.approve": identifier,
  "jobs.detail": identifier,
  "jobs.process": identifier,
  "audit.list": z.object({ offset: z.number().int().min(0).max(100000).optional() }).strict(),
  "jobs.discard": z.object({ id, reason: text }).strict(),
  "jobs.reprocess": identifier,
  "media.upload": z
    .object({
      purpose: z.enum(["avatar", "content"]),
      filename: z.string().max(200),
      content_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      bytes: z
        .number()
        .int()
        .positive()
        .max(5 * 1024 * 1024),
      data: z.string().max(7 * 1024 * 1024),
    })
    .strict(),
} as const;
export type MoonAction = keyof typeof actionSchemas;
export type MoonPayload<A extends MoonAction> = z.input<(typeof actionSchemas)[A]>;
export const requestSchema = z
  .object({
    action: z.enum(Object.keys(actionSchemas) as [MoonAction, ...MoonAction[]]),
    payload: z.unknown(),
  })
  .strict();
