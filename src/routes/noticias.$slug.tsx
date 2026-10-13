import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Newspaper } from "lucide-react";
import { publicNews, MoonApiError } from "@/lib/moonastery/client";
import { PublicShell } from "@/components/moonastery-public/public-shell";
import { usePublicHome } from "@/components/moonastery-public/public-data";
import {
  PublicEmptyState,
  PublicError,
  PublicLoading,
} from "@/components/moonastery-public/empty-state";
import { PublicImage } from "@/components/moonastery-public/media";
import { formatPublicDate } from "@/components/moonastery-public/dates";

export const Route = createFileRoute("/noticias/$slug")({
  component: NewsPage,
  head: () => ({
    meta: [
      { title: "Notícias | Moonastery E-Sports" },
      { name: "description", content: "Notícias e conquistas da Moonastery E-Sports." },
    ],
  }),
});

function NewsPage() {
  const { slug } = Route.useParams();
  const home = usePublicHome();
  const news = useQuery({
    queryKey: ["moonastery", "public-news", slug],
    queryFn: () => publicNews(slug),
    staleTime: 60_000,
    retry: (failureCount, error) =>
      !(error instanceof MoonApiError && error.status === 404) && failureCount < 1,
  });
  return (
    <PublicShell organization={home.data?.organization} socials={home.data?.socials}>
      <main id="conteudo" className="moon-container moon-article">
        <a href="/#noticias" className="moon-article-back">
          <ArrowLeft aria-hidden="true" size={18} />
          Voltar às notícias
        </a>
        {news.isPending ? (
          <PublicLoading />
        ) : news.isError ? (
          news.error instanceof MoonApiError && news.error.status === 404 ? (
            <PublicEmptyState title="Notícia não encontrada">
              Esta notícia não está disponível. Explore as publicações na página inicial.
            </PublicEmptyState>
          ) : (
            <PublicError
              pending={news.isFetching}
              onRetry={() => {
                void news.refetch();
              }}
            />
          )
        ) : news.data ? (
          <article>
            <div className="moon-news-meta">
              <span>{news.data.category || "Notícia"}</span>
              <time dateTime={news.data.published_at || undefined}>
                {formatPublicDate(news.data.published_at)}
              </time>
            </div>
            <h1>{news.data.title}</h1>
            <p className="moon-article-summary">{news.data.summary}</p>
            <PublicImage
              key={news.data.cover_url}
              src={news.data.cover_url}
              alt={news.data.title}
              width={1200}
              height={720}
              className="moon-article-cover"
              fallback={<Newspaper aria-hidden="true" size={80} strokeWidth={1} />}
            />
            <div className="moon-article-content">
              {news.data.content
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          </article>
        ) : null}
      </main>
    </PublicShell>
  );
}
