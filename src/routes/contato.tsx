import { createFileRoute } from "@tanstack/react-router";
import { PublicSubmissionForm } from "@/components/moonastery-public/public-submission-form";
import { PublicShell } from "@/components/moonastery-public/public-shell";
import { usePublicHome } from "@/components/moonastery-public/public-data";

export const Route = createFileRoute("/contato")({
  component: Contact,
  head: () => ({
    meta: [
      { title: "Denúncias e sugestões | Moonastery E-Sports" },
      {
        name: "description",
        content: "Envie uma denúncia, sugestão ou mensagem para a Moonastery E-Sports.",
      },
    ],
  }),
});

function Contact() {
  const home = usePublicHome();
  return (
    <PublicShell organization={home.data?.organization} socials={home.data?.socials}>
      <main id="conteudo" className="moon-container moon-contact-page">
        <div className="moon-contact-card">
          <p className="moon-hero-intro">Fale com a Moonastery</p>
          <h1>Denúncias e sugestões</h1>
          <p className="moon-contact-description">
            Este canal está aberto a jogadores, fãs e qualquer pessoa da comunidade. As mensagens
            são encaminhadas à equipe para análise.
          </p>
          <PublicSubmissionForm />
        </div>
      </main>
    </PublicShell>
  );
}
