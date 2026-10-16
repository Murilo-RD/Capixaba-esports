import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUpRight,
  Crosshair,
  Gamepad2,
  Newspaper,
  Rocket,
  Shield,
} from "lucide-react";
import mascot from "@/assets/moonastery-mascot.png";
import type { Game, PublicHome, PublicNews } from "@/lib/moonastery/types";
import { ContentCarousel } from "@/components/moonastery-public/carousel";
import {
  PublicEmptyState,
  PublicError,
  PublicLoading,
} from "@/components/moonastery-public/empty-state";
import { PublicImage } from "@/components/moonastery-public/media";
import { formatPublicDate } from "@/components/moonastery-public/dates";
import { PublicPlayerDetails } from "@/components/moonastery-public/player-card";
import { usePublicHome } from "@/components/moonastery-public/public-data";
import { PublicShell, SocialIcon } from "@/components/moonastery-public/public-shell";

export const Route = createFileRoute("/")({
  component: Home,
  validateSearch: (search: Record<string, unknown>): { modalidade?: string } => ({
    modalidade: typeof search.modalidade === "string" ? search.modalidade : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Moonastery E-Sports | Uma nova órbita competitiva" },
      {
        name: "description",
        content:
          "Conheça a Moonastery E-Sports, seus jogadores, modalidades, notícias e parceiros.",
      },
    ],
  }),
});

function Home() {
  const home = usePublicHome();
  const organization = home.data?.organization;
  return (
    <PublicShell organization={organization} socials={home.data?.socials}>
      <main id="conteudo">
        <section id="inicio" className="moon-hero" aria-labelledby="hero-title">
          <div className="moon-container moon-hero-layout">
            <div className="moon-hero-copy">
              <p className="moon-hero-intro">Moonastery E-Sports</p>
              <h1 id="hero-title">
                {organization?.hero_title || (
                  <>
                    Uma nova
                    <br />
                    órbita competitiva.
                  </>
                )}
              </h1>
              <p className="moon-hero-description">
                {organization?.hero_subtitle ||
                  "Talento em evolução. Mentalidade de equipe. O próximo capítulo começa dentro de jogo."}
              </p>
              <div className="moon-hero-actions">
                <a className="moon-button" href="#equipe">
                  Conheça a equipe <ArrowUpRight aria-hidden="true" size={19} />
                </a>
                <a className="moon-text-link" href="#jogos">
                  Nossas modalidades <ArrowDown aria-hidden="true" size={17} />
                </a>
              </div>
            </div>
            <div className="moon-hero-art">
              <div className="moon-orbit moon-orbit-cyan" aria-hidden="true" />
              <div className="moon-orbit moon-orbit-pink" aria-hidden="true" />
              <div className="moon-lunar-disc">
                <img
                  src={mascot}
                  alt="Lunático, mascote oficial da Moonastery, uma lua com uniforme preto, ciano e magenta"
                  width={1254}
                  height={1254}
                  fetchPriority="high"
                />
              </div>
              <span className="moon-mascot-caption">
                Lunático <span>Mascote oficial</span>
              </span>
            </div>
          </div>
          <div className="moon-hero-baseline">
            <div className="moon-container">
              <span>Uma equipe. Uma identidade.</span>
              <span>
                Moonastery E-Sports <span aria-hidden="true">✦</span>
              </span>
            </div>
          </div>
        </section>
        {home.isPending ? (
          <div className="moon-container">
            <PublicLoading />
          </div>
        ) : home.isError ? (
          <div className="moon-container">
            <PublicError
              pending={home.isFetching}
              onRetry={() => {
                void home.refetch();
              }}
            />
          </div>
        ) : home.data ? (
          <HomeSections data={home.data} />
        ) : null}
      </main>
    </PublicShell>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="moon-section-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function HomeSections({ data }: { data: PublicHome }) {
  const { modalidade } = Route.useSearch();
  const navigate = Route.useNavigate();
  const games = data.games
    .filter((game) => game.active)
    .sort((a, b) => a.display_order - b.display_order);
  const gameFilter = games.some((game) => game.slug === modalidade) ? modalidade : "all";
  const setGameFilter = (slug: string) => {
    void navigate({
      search: { modalidade: slug === "all" ? undefined : slug },
      hash: "jogos",
      replace: true,
    });
  };
  const selectedGames =
    gameFilter === "all" ? games : games.filter((game) => game.slug === gameFilter);
  const partners = data.partners
    .filter((partner) => partner.active)
    .sort((a, b) => a.display_order - b.display_order);
  const socials = data.socials
    .filter((social) => social.active)
    .sort((a, b) => a.display_order - b.display_order);
  const news = data.news.filter((item) => item.status === "published");
  return (
    <>
      <section id="equipe" className="moon-section moon-container">
        <SectionHeading
          title="Nossa equipe"
          description="Conheça os jogadores e coaches que levam a identidade Moonastery para dentro de jogo."
        />
        {data.players.length ? (
          <>
            <div className="moon-roster-grid">
              {data.players.map((player) => (
                <PublicPlayerDetails key={player.id} player={player} />
              ))}
            </div>
            <p className="moon-section-note">
              Classificação pelo overall da última avaliação aprovada. Integrantes sem avaliação
              aparecem sem nota.
            </p>
          </>
        ) : (
          <PublicEmptyState title="A equipe está ganhando forma">
            Os perfis dos jogadores e coaches serão apresentados aqui assim que forem publicados.
          </PublicEmptyState>
        )}
      </section>
      <section id="jogos" className="moon-section moon-games-section">
        <div className="moon-container">
          <SectionHeading
            title="Onde jogamos"
            description="Diferentes arenas. A mesma vontade de evoluir juntos."
          />
          {games.length ? (
            <>
              <div className="moon-filters" role="group" aria-label="Filtrar por modalidade">
                <button
                  type="button"
                  aria-pressed={gameFilter === "all"}
                  onClick={() => setGameFilter("all")}
                >
                  Todas as modalidades
                </button>
                {games.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    aria-pressed={gameFilter === game.slug}
                    onClick={() => setGameFilter(game.slug)}
                  >
                    {game.name}
                  </button>
                ))}
              </div>
              <ContentCarousel key={gameFilter} label="Modalidades">
                {selectedGames.map((game) => (
                  <div className="moon-carousel-slide" key={game.id}>
                    <GameCard
                      game={game}
                      playerCount={
                        data.players.filter((player) => player.game_id === game.id).length
                      }
                    />
                  </div>
                ))}
              </ContentCarousel>
            </>
          ) : (
            <PublicEmptyState title="Novas arenas, em breve">
              As modalidades da organização serão divulgadas nesta seção.
            </PublicEmptyState>
          )}
        </div>
      </section>
      <section id="noticias" className="moon-section moon-container">
        <SectionHeading
          title="Por dentro do cenário"
          description="Notícias, conquistas e os próximos capítulos da Moonastery."
        />
        {news.length ? (
          <ContentCarousel label="Notícias">
            {news.map((item) => (
              <div className="moon-carousel-slide" key={item.id}>
                <NewsCard news={item} />
              </div>
            ))}
          </ContentCarousel>
        ) : (
          <PublicEmptyState title="O próximo capítulo vem aí">
            As notícias e conquistas da Moonastery serão publicadas aqui.
          </PublicEmptyState>
        )}
      </section>
      <section id="parceiros" className="moon-section moon-partners-section">
        <div className="moon-container">
          <SectionHeading
            title="Ao nosso lado"
            description="Marcas e parceiros que fazem parte da nossa trajetória."
          />
          {partners.length ? (
            <div className="moon-partners-grid">
              {partners.map((partner) => {
                const content = (
                  <>
                    <PublicImage
                      key={partner.logo_url}
                      src={partner.logo_url}
                      alt={partner.name}
                      width={220}
                      height={100}
                      className="moon-partner-logo"
                      fallback={<span>{partner.name}</span>}
                    />
                    <span className="moon-partner-name">{partner.name}</span>
                    {partner.description ? <p>{partner.description}</p> : null}
                  </>
                );
                return partner.url ? (
                  <a
                    className="moon-partner"
                    key={partner.id}
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${partner.name}, abre em nova aba`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="moon-partner" key={partner.id}>
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <PublicEmptyState title="Espaço para construir juntos">
              Os parceiros oficiais da Moonastery serão apresentados aqui.
            </PublicEmptyState>
          )}
        </div>
      </section>
      <section id="redes" className="moon-section moon-container moon-social-section">
        <div>
          <h2>
            Acompanhe
            <br />a Moonastery.
          </h2>
          <p>
            Faça parte da nossa órbita. Siga os canais oficiais e acompanhe o que acontece dentro e
            fora de jogo.
          </p>
        </div>
        {socials.length ? (
          <div className="moon-social-links">
            {socials.map((social) => (
              <a href={social.url} target="_blank" rel="noopener noreferrer" key={social.id}>
                <SocialIcon platform={social.icon || social.platform} />
                <span>{social.platform}</span>
                <ArrowUpRight aria-hidden="true" size={20} />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="moon-social-empty">Os canais oficiais serão divulgados em breve.</p>
        )}
      </section>
    </>
  );
}

function GameCard({ game, playerCount }: { game: Game; playerCount: number }) {
  const Icon = game.slug.includes("rocket")
    ? Rocket
    : game.slug.includes("counter")
      ? Crosshair
      : game.slug.includes("valorant")
        ? Shield
        : Gamepad2;
  return (
    <article className={`moon-game-card moon-game-${game.slug}`}>
      <PublicImage
        key={game.image_url}
        src={game.image_url}
        alt={game.name}
        width={600}
        height={440}
        className="moon-game-art"
        fallback={<Icon aria-hidden="true" size={94} strokeWidth={1} />}
      />
      <div className="moon-game-info">
        <h3>{game.name}</h3>
        <p>{game.description || "Uma modalidade na órbita da Moonastery."}</p>
        {playerCount > 0 ? (
          <span>
            {playerCount} {playerCount === 1 ? "jogador na equipe" : "jogadores na equipe"}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function NewsCard({ news }: { news: PublicNews }) {
  return (
    <article className="moon-news-card">
      <a href={`/noticias/${encodeURIComponent(news.slug)}`}>
        <PublicImage
          key={news.cover_url}
          src={news.cover_url}
          alt={news.title}
          width={600}
          height={360}
          className="moon-news-cover"
          fallback={<Newspaper aria-hidden="true" size={64} strokeWidth={1} />}
        />
        <div className="moon-news-copy">
          <div className="moon-news-meta">
            <span>{news.category || "Notícia"}</span>
            <time dateTime={news.published_at || undefined}>
              {formatPublicDate(news.published_at)}
            </time>
          </div>
          <h3>{news.title}</h3>
          <p>{news.summary}</p>
          <span className="moon-news-read">
            Ler notícia <ArrowUpRight aria-hidden="true" size={18} />
          </span>
        </div>
      </a>
    </article>
  );
}
