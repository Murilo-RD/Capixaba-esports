import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { actionSchemas, type MoonAction, type MoonPayload } from "@/lib/moonastery/schemas";
import { moonRequest } from "@/lib/moonastery/client";

export type FormValue = string | number | boolean | string[] | null | object;
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "checkbox"
    | "select"
    | "image"
    | "json"
    | "multi"
    | "media"
    | "weights";
  options?: { value: string; label: string }[];
  required?: boolean;
  nullable?: boolean;
  help?: ReactNode | ((values: Record<string, FormValue>) => ReactNode);
  purpose?: "avatar" | "content";
};

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="team-panel">
      <h2>{title}</h2>
      {description && <p className="team-muted">{description}</p>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="team-empty">{children}</p>;
}

export function ActionButton({
  action,
  payload,
  children,
  confirmation,
  successMessage,
}: {
  action: MoonAction;
  payload: MoonPayload<MoonAction>;
  children: ReactNode;
  confirmation?: string;
  successMessage?: string;
}) {
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => moonRequest(action, payload),
    onSuccess: () => {
      toast.success(successMessage ?? "Alteração salva.");
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
    },
  });
  return (
    <button
      type="button"
      className="team-button team-button-secondary"
      disabled={mutation.isPending}
      onClick={() => {
        if (!confirmation || window.confirm(confirmation)) mutation.mutate();
      }}
    >
      {mutation.isPending ? "Salvando…" : children}
    </button>
  );
}

export function EditorForm({
  action,
  initial,
  fields,
  submitLabel = "Salvar",
  onSaved,
}: {
  action: MoonAction;
  initial: Record<string, FormValue>;
  fields: Field[];
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const prefix = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: MoonPayload<MoonAction>) => moonRequest(action, payload),
    onSuccess: () => {
      toast.success("Alteração salva.");
      setError(null);
      void cache.invalidateQueries({ queryKey: ["moon-team"] });
      onSaved?.();
    },
    onError: (error: Error) => setError(error.message),
  });
  function update(name: string, value: FormValue) {
    setValues((current) => ({ ...current, [name]: value }));
  }
  async function upload(
    name: string,
    file: File,
    purpose: "avatar" | "content",
    onUploaded?: (url: string) => void,
  ) {
    setError(null);
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError("Use PNG, JPEG ou WebP de até 5 MB.");
      return;
    }
    setUploading(name);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const uploaded = await moonRequest<{ url: string }>("media.upload", {
        purpose,
        filename: file.name,
        content_type: file.type as "image/png" | "image/jpeg" | "image/webp",
        bytes: file.size,
        data,
      });
      if (onUploaded) onUploaded(uploaded.url);
      else update(name, uploaded.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha no envio da imagem.");
    } finally {
      setUploading(null);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { ...values };
    try {
      for (const field of fields) {
        if (field.type === "json" && typeof payload[field.name] === "string")
          payload[field.name] = JSON.parse(String(payload[field.name]));
        if (field.nullable && payload[field.name] === "") payload[field.name] = null;
      }
      const parsed = actionSchemas[action].safeParse(payload);
      if (!parsed.success) {
        setError(
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n"),
        );
        return;
      }
      mutation.mutate(parsed.data);
    } catch {
      setError("Revise o JSON informado; use aspas duplas nos nomes e textos.");
    }
  }
  return (
    <form
      className="team-form"
      onSubmit={submit}
      aria-busy={mutation.isPending || Boolean(uploading)}
    >
      {fields.map((field) => {
        const id = `${prefix}-${field.name}`;
        const value = values[field.name];
        const help = typeof field.help === "function" ? field.help(values) : field.help;
        return (
          <div className="team-field" key={field.name}>
            {field.type === "media" ? (
              <span id={`${id}-label`}>{field.label}</span>
            ) : (
              <label htmlFor={id}>{field.label}</label>
            )}
            {field.type === "textarea" || field.type === "json" ? (
              <textarea
                id={id}
                rows={field.type === "json" ? 8 : 4}
                required={field.required}
                value={
                  typeof value === "object" && value !== null
                    ? JSON.stringify(value, null, 2)
                    : String(value ?? "")
                }
                onChange={(event) => update(field.name, event.target.value)}
              />
            ) : field.type === "media" ? (
              <MediaFields
                labelledBy={`${id}-label`}
                value={value}
                uploading={uploading === field.name}
                onChange={(next) => update(field.name, next)}
                onUploadImage={(file, index) => {
                  void upload(field.name, file, "content", (url) => {
                    setValues((current) => {
                      const items = Array.isArray(current[field.name])
                        ? [...(current[field.name] as { type: string; url: string }[])]
                        : [];
                      if (index === undefined) {
                        if (items.length >= 20) return current;
                        items.push({ type: "image", url });
                      } else if (items[index]?.type === "image") {
                        items[index] = { type: "image", url };
                      } else return current;
                      return { ...current, [field.name]: items };
                    });
                  });
                }}
              />
            ) : field.type === "weights" ? (
              <div className="team-weights">
                {["VEL", "FIN", "CRI", "DEF", "POS", "BST", "IMP"].map((attribute) => (
                  <label key={attribute}>
                    {attribute}
                    <input
                      aria-label={`Peso de ${attribute}`}
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={Number((value as Record<string, number>)?.[attribute] ?? 0)}
                      onChange={(event) =>
                        update(field.name, {
                          ...(value as object),
                          [attribute]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : field.type === "checkbox" ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => update(field.name, event.target.checked)}
              />
            ) : field.type === "multi" ? (
              <select
                id={id}
                multiple
                value={Array.isArray(value) ? value : []}
                onChange={(event) =>
                  update(
                    field.name,
                    Array.from(event.target.selectedOptions, (option) => option.value),
                  )
                }
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "select" ? (
              <select
                id={id}
                value={String(value ?? "")}
                required={field.required}
                onChange={(event) => update(field.name, event.target.value)}
              >
                {field.nullable && <option value="">Não definido</option>}
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "image" ? (
              <>
                <input
                  id={id}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={Boolean(uploading)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(field.name, file, field.purpose ?? "content");
                  }}
                />
                {uploading === field.name ? (
                  <p role="status">Enviando imagem…</p>
                ) : typeof value === "string" && value ? (
                  <>
                    <img className="team-image-preview" src={value} alt="Imagem selecionada" />
                    <button
                      type="button"
                      className="team-text-button"
                      onClick={() => update(field.name, null)}
                    >
                      Remover imagem
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <input
                id={id}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                aria-describedby={help ? `${id}-help` : undefined}
                min={field.type === "number" ? 0 : undefined}
                required={field.required}
                value={String(value ?? "")}
                onChange={(event) =>
                  update(
                    field.name,
                    field.type === "number" ? Number(event.target.value) : event.target.value,
                  )
                }
              />
            )}
            {help && (
              <p id={`${id}-help`} className="team-muted">
                {help}
              </p>
            )}
          </div>
        );
      })}
      {error && (
        <p className="team-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="team-button"
        type="submit"
        disabled={mutation.isPending || Boolean(uploading)}
      >
        {mutation.isPending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}

function MediaFields({
  labelledBy,
  value,
  onChange,
  onUploadImage,
  uploading,
}: {
  labelledBy: string;
  value: FormValue;
  onChange: (value: FormValue) => void;
  onUploadImage: (file: File, index?: number) => void;
  uploading: boolean;
}) {
  const items = Array.isArray(value)
    ? (value as unknown as { type: "image" | "video" | "link"; url: string }[])
    : [];
  return (
    <div className="team-media-editor" role="group" aria-labelledby={labelledBy}>
      {items.map((item, index) => (
        <div className="team-media-entry" key={index}>
          {item.type === "image" ? (
            <div className="team-media-image-entry">
              <img
                src={item.url}
                width="128"
                height="96"
                loading="lazy"
                alt={`Imagem de apoio ${index + 1}`}
              />
              <div>
                <strong>Imagem {index + 1}</strong>
                <label className="team-media-upload">
                  Substituir arquivo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onUploadImage(file, index);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="team-media-field">
              <select
                aria-label={`Tipo de material ${index + 1}`}
                value={item.type}
                onChange={(event) =>
                  onChange(
                    items.map((row, i) =>
                      i === index ? { ...row, type: event.target.value as "video" | "link" } : row,
                    ),
                  )
                }
              >
                <option value="video">Vídeo</option>
                <option value="link">Link</option>
              </select>
              <input
                type="url"
                aria-label={`URL do ${item.type === "video" ? "vídeo" : "link"} ${index + 1}`}
                placeholder="https://…"
                value={item.url}
                required
                onChange={(event) =>
                  onChange(
                    items.map((row, i) =>
                      i === index ? { ...row, url: event.target.value } : row,
                    ),
                  )
                }
              />
            </div>
          )}
          <button
            type="button"
            className="team-text-button"
            disabled={uploading}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remover {item.type === "image" ? "imagem" : "material"}
          </button>
        </div>
      ))}
      {uploading && <p role="status">Enviando imagem…</p>}
      <div className="team-media-add">
        <label className="team-media-upload">
          Enviar imagem
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading || items.length >= 20}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUploadImage(file);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="team-button team-button-secondary"
          disabled={uploading || items.length >= 20}
          onClick={() => onChange([...items, { type: "link", url: "" }])}
        >
          Adicionar vídeo ou link
        </button>
      </div>
      <p className="team-muted">
        Imagens: PNG, JPEG ou WebP de até 5 MB. Depois do envio, salve a instrução.
      </p>
    </div>
  );
}
