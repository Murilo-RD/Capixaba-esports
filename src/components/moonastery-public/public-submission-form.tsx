import { useState, type FormEvent } from "react";
import { publicSubmission } from "@/lib/moonastery/client";

export function PublicSubmissionForm() {
  const [category, setCategory] = useState("suggestion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await publicSubmission({
        category: category as "suggestion" | "technical" | "complaint" | "other",
        title,
        description,
        website,
      });
      setSent(true);
      setTitle("");
      setDescription("");
      setWebsite("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar sua mensagem.");
    } finally {
      setPending(false);
    }
  }

  if (sent)
    return (
      <div className="moon-public-form-notice" role="status">
        Obrigado por escrever para a Moonastery. Sua mensagem foi enviada para análise.
        <button type="button" onClick={() => setSent(false)}>
          Enviar outra mensagem
        </button>
      </div>
    );

  return (
    <form className="moon-public-form" onSubmit={submit} aria-busy={pending}>
      <label>
        Categoria
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="suggestion">Recomendação ou sugestão</option>
          <option value="complaint">Denúncia</option>
          <option value="technical">Problema técnico</option>
          <option value="other">Outro assunto</option>
        </select>
      </label>
      <label>
        Assunto
        <input
          maxLength={200}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        Mensagem
        <textarea
          maxLength={10000}
          rows={6}
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label className="moon-public-form-honeypot" aria-hidden="true" tabIndex={-1}>
        Website
        <input
          autoComplete="off"
          tabIndex={-1}
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>
      {error && (
        <p className="moon-public-form-error" role="alert">
          {error}
        </p>
      )}
      <button className="moon-button" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar mensagem"}
      </button>
      <p className="moon-public-form-note">
        Você pode enviar sem criar uma conta. Evite incluir dados pessoais desnecessários.
      </p>
    </form>
  );
}
