import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownRight, ArrowUpRight, Crown, Minus, UserRound, X } from "lucide-react";
import type { Attribute, PublicPlayer } from "@/lib/moonastery/types";
import { playerArchetypeLabel } from "@/lib/moonastery/player-card";
import logo from "@/assets/moonastery-logo.png";
import { PublicImage } from "./media";
import { formatPublicDate } from "./dates";

const attributes: [Attribute, string][] = [
  ["VEL", "Velocidade e movimentação"],
  ["FIN", "Finalização"],
  ["CRI", "Criação e agressividade"],
  ["DEF", "Defesa e segurança"],
  ["POS", "Posicionamento e rotação"],
  ["BST", "Gestão de boost"],
  ["IMP", "Impacto geral"],
];
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function PlayerEvolution({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="moon-evolution">Sem comparação</span>;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "stable";
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`moon-evolution moon-evolution-${direction}`}>
      <Icon aria-hidden="true" size={16} />
      {value === 0
        ? "Estável"
        : `${value > 0 ? "+" : ""}${number.format(value)} na última avaliação`}
    </span>
  );
}

export function PlayerCard({ player, children }: { player: PublicPlayer; children?: ReactNode }) {
  return (
    <article
      className="moon-player-card"
      data-role={player.role}
      aria-label={`Carta de ${player.nick}`}
    >
      <div className="moon-card-top">
        <div>
          <span className="moon-overall">
            {player.card?.overall == null ? "—" : number.format(player.card.overall)}
          </span>
          <span className="moon-overall-label">Overall</span>
        </div>
        <img src={logo} alt="Moonastery" width={48} height={48} loading="lazy" />
      </div>
      <PublicImage
        key={player.photo_url}
        src={player.photo_url}
        alt={`Foto de ${player.nick}`}
        width={320}
        height={240}
        className="moon-player-photo"
        fallback={<UserRound aria-hidden="true" size={80} strokeWidth={1} />}
      />
      <div className="moon-card-identity">
        <h3>{player.nick}</h3>
        <p className="moon-card-role">
          {player.role === "owner" && <Crown size={15} aria-hidden="true" />}
          {playerArchetypeLabel(player)}
        </p>
      </div>
      <dl className="moon-card-attributes">
        {attributes.map(([attribute, label]) => (
          <div key={attribute}>
            <dt>
              <abbr title={label} aria-label={label}>
                {attribute}
              </abbr>
            </dt>
            <dd>
              {player.card?.attributes[attribute] == null ? (
                <span aria-label="Sem dados">—</span>
              ) : (
                number.format(player.card.attributes[attribute]!)
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="moon-card-bottom">
        <PlayerEvolution value={player.card?.evolution} />
        {player.ranking_position != null ? (
          <span>#{player.ranking_position} no ranking</span>
        ) : (
          <span>Sem classificação</span>
        )}
      </div>
      {children}
    </article>
  );
}

export function PublicPlayerDetails({ player }: { player: PublicPlayer }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="moon-player-trigger"
          data-role={player.role}
          type="button"
          aria-label={`Ver carta e perfil de ${player.nick}`}
        >
          <PublicImage
            key={player.photo_url}
            src={player.photo_url}
            alt={`Foto de ${player.nick}`}
            width={360}
            height={380}
            className="moon-roster-photo"
            fallback={<UserRound aria-hidden="true" size={84} strokeWidth={1} />}
          />
          <span className="moon-roster-position">
            {player.ranking_position == null ? "Sem classificação" : `#${player.ranking_position}`}
          </span>
          <span className="moon-roster-info">
            <span className="moon-roster-nick">{player.nick}</span>
            <span className="moon-card-role">
              {player.role === "owner" && <Crown size={15} aria-hidden="true" />}
              {playerArchetypeLabel(player)}
            </span>
          </span>
          <span className="moon-roster-overall">
            {player.card?.overall == null ? "—" : number.format(player.card.overall)}
            <small>Overall</small>
          </span>
          <span className="moon-roster-evolution">
            <PlayerEvolution value={player.card?.evolution} />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="moon-modal-overlay" />
        <Dialog.Content className="moon-player-modal">
          <Dialog.Close className="moon-modal-close" aria-label="Fechar perfil">
            <X aria-hidden="true" size={22} />
          </Dialog.Close>
          <Dialog.Title className="moon-modal-title">{player.nick}</Dialog.Title>
          <Dialog.Description className="moon-modal-description">
            Carta e perfil público de um integrante da Moonastery.
          </Dialog.Description>
          <PlayerCard player={player} />
          {player.bio ? <p className="moon-player-bio">{player.bio}</p> : null}
          <p className="moon-card-note">
            {player.card
              ? `Última avaliação aprovada em ${formatPublicDate(player.card.approved_at)}.`
              : "Este integrante ainda não possui uma avaliação aprovada."}{" "}
            Atributos sem dados aparecem com um traço.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
