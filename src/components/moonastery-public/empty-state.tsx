import type { ReactNode } from "react";
import { Orbit } from "lucide-react";

export function PublicEmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="moon-empty">
      <Orbit aria-hidden="true" size={40} strokeWidth={1} />
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function PublicLoading() {
  return (
    <div className="moon-loading" role="status">
      <span aria-hidden="true" />
      Carregando conteúdo da Moonastery…
    </div>
  );
}

export function PublicError({ onRetry, pending }: { onRetry: () => void; pending: boolean }) {
  return (
    <div className="moon-error" role="alert">
      <h2>O conteúdo está indisponível no momento.</h2>
      <p>Não foi possível carregar as informações. Tente novamente em alguns instantes.</p>
      <button type="button" className="moon-button" onClick={onRetry} disabled={pending}>
        {pending ? "Carregando…" : "Tentar novamente"}
      </button>
    </div>
  );
}
