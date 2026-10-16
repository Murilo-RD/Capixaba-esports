import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Instagram, Menu, MessageCircle, Radio, Twitch, Youtube, X } from "lucide-react";
import type { Organization, SocialLink } from "@/lib/moonastery/types";
import horizontalLogo from "@/assets/moonastery-horizontal.png";

const navigation = [
  ["inicio", "Início"],
  ["equipe", "Equipe"],
  ["jogos", "Jogos"],
  ["noticias", "Notícias"],
  ["parceiros", "Parceiros"],
  ["redes", "Redes sociais"],
];

export function SocialIcon({ platform }: { platform: string }) {
  const name = platform.toLowerCase();
  const props = { size: 24, "aria-hidden": true as const };
  if (name.includes("instagram")) return <Instagram {...props} />;
  if (name.includes("youtube")) return <Youtube {...props} />;
  if (name.includes("twitch")) return <Twitch {...props} />;
  if (name.includes("discord")) return <MessageCircle {...props} />;
  if (name.includes("twitter") || name === "x")
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 4h4l10 16h-4L5 4Zm14 0L5 20" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  if (name.includes("tiktok"))
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 3v13a4 4 0 1 1-4-4m4-9c0 5 4 6 6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  return <Radio {...props} />;
}

export function PublicShell({
  children,
  organization,
  socials = [],
}: {
  children: ReactNode;
  organization?: Organization | null;
  socials?: SocialLink[];
}) {
  const activeSocials = socials
    .filter((social) => social.active)
    .sort((a, b) => a.display_order - b.display_order);
  return (
    <div className="moon-public">
      <a className="moon-skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="moon-header">
        <a href="/" className="moon-brand" aria-label="Moonastery E-Sports, início">
          <img
            src={horizontalLogo}
            alt="Moonastery E-Sports"
            width={433}
            height={139}
            fetchPriority="high"
          />
        </a>
        <nav className="moon-desktop-nav" aria-label="Navegação principal">
          {navigation.map(([id, name]) => (
            <a key={id} href={`/#${id}`}>
              {name}
            </a>
          ))}
          <a
            className="moon-nav-contact"
            href="/contato"
            aria-label="Enviar denúncia ou recomendação"
          >
            <span className="moon-nav-contact-label">Denúncias e recomendações</span>
            <span className="moon-nav-contact-short" aria-hidden="true">
              Canal público
            </span>
          </a>
        </nav>
        <Dialog.Root>
          <Dialog.Trigger className="moon-menu-trigger" aria-label="Abrir menu">
            <Menu aria-hidden="true" size={25} />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="moon-modal-overlay" />
            <Dialog.Content className="moon-mobile-menu">
              <Dialog.Title>Moonastery</Dialog.Title>
              <Dialog.Description>Explore a organização.</Dialog.Description>
              <Dialog.Close className="moon-modal-close" aria-label="Fechar menu">
                <X aria-hidden="true" size={24} />
              </Dialog.Close>
              <nav aria-label="Navegação mobile">
                {navigation.map(([id, name]) => (
                  <Dialog.Close asChild key={id}>
                    <a href={`/#${id}`}>{name}</a>
                  </Dialog.Close>
                ))}
                <Dialog.Close asChild>
                  <a href="/contato">Denúncias e recomendações</a>
                </Dialog.Close>
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      {children}
      <footer className="moon-footer">
        <div className="moon-container moon-footer-grid">
          <div>
            <img
              src={horizontalLogo}
              alt="Moonastery E-Sports"
              width={280}
              height={90}
              loading="lazy"
            />
            <p>
              {organization?.description ||
                "Uma organização de eSports movida pela competição, pelo desenvolvimento de jogadores e pela força da equipe."}
            </p>
          </div>
          <nav aria-label="Links institucionais">
            <h2>Explore</h2>
            {navigation.slice(1, 5).map(([id, name]) => (
              <a key={id} href={`/#${id}`}>
                {name}
              </a>
            ))}
            <a href="/contato">Denúncias e recomendações</a>
          </nav>
          <nav aria-label="Informações legais">
            <h2>Informações</h2>
            <a href="/privacidade">Privacidade e dados</a>
            <a href="/termos">Termos de uso</a>
            <a href="/contato">Fale com a Moonastery</a>
          </nav>
          <div>
            <h2>Conecte-se</h2>
            {activeSocials.length ? (
              <div className="moon-footer-socials">
                {activeSocials.map((social) => (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${social.platform}, abre em nova aba`}
                  >
                    <SocialIcon platform={social.icon || social.platform} />
                  </a>
                ))}
              </div>
            ) : (
              <p>Os canais oficiais serão divulgados aqui.</p>
            )}
            {organization?.contact_email ? (
              <a href={`mailto:${organization.contact_email}`}>{organization.contact_email}</a>
            ) : null}
          </div>
        </div>
        <div className="moon-container moon-footer-bottom">
          <p>© {new Date().getFullYear()} Moonastery E-Sports. Todos os direitos reservados.</p>
          <a href="/privacidade">Privacidade</a>
          <a href="/termos">Termos de uso</a>
          <a href="/team">Área da equipe</a>
        </div>
      </footer>
    </div>
  );
}
