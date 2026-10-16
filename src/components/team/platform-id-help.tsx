const platformGuides = {
  steam: {
    label: "Steam",
    description: "Use seu SteamID64 (número de 17 dígitos).",
    url: "https://help.steampowered.com/pt-br/faqs/view/2816-BE67-5B69-0FEC",
  },
  epic: {
    label: "Epic Games",
    description: "Use o ID da conta Epic Games, disponível em Informações da conta.",
    url: "https://www.epicgames.com/help/c-45487929/c-Trending_0/a24590453?lang=pt-BR",
  },
  ps4: {
    label: "PlayStation",
    description: "Use sua ID online da PSN, exibida no perfil do console ou no PlayStation App.",
    url: "https://www.playstation.com/pt-br/support/account/change-online-id/",
  },
  xbox: {
    label: "Xbox",
    description: "Use sua Gamertag do Xbox, incluindo o sufixo se ele aparecer no perfil.",
    url: "https://www.epicgames.com/help/c-45487929/a23102823",
  },
} as const;

export function PlatformIdHelp({ platform }: { platform: unknown }) {
  const guide = platformGuides[platform as keyof typeof platformGuides];
  if (!guide) return <>Selecione uma plataforma para ver onde encontrar seu ID.</>;

  return (
    <>
      {guide.description}{" "}
      <a
        href={guide.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
      >
        Onde encontrar meu ID {guide.label}
        <span className="sr-only"> (abre em nova aba)</span>
        <span aria-hidden="true"> ↗</span>
      </a>
    </>
  );
}
