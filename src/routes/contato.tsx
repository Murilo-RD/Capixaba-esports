import { createFileRoute } from "@tanstack/react-router";
import { PublicSubmissionForm } from "@/components/moonastery-public/public-submission-form";
import { PublicShell } from "@/components/moonastery-public/public-shell";
import { usePublicHome } from "@/components/moonastery-public/public-data";

export const Route = createFileRoute("/contato")({
  component: Contact,
  head: () => ({
    meta: [
      { title: "Denúncias e recomendações | Moonastery E-Sports" },
      {
        name: "description",
        content:
          "Envie uma denúncia, recomendação ou mensagem à Moonastery E-Sports, sem criar uma conta.",
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
          <h1>Denúncias e recomendações</h1>
          <p className="moon-contact-description">
            Qualquer pessoa pode enviar uma denúncia, recomendação ou sugestão à Moonastery. Não é
            preciso ter uma conta; as mensagens são encaminhadas à equipe para análise.
          </p>
          <PublicSubmissionForm />
        </div>
      </main>
    </PublicShell>
  );
}
