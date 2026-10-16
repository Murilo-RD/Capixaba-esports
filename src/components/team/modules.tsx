import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { moonRequest } from "@/lib/moonastery/client";
import { playerArchetypeLabel } from "@/lib/moonastery/player-card";
import type {
  Archetype,
  DashboardData,
  Instruction,
  News,
  Player,
  ReplayJob,
  Report,
  Role,
} from "@/lib/moonastery/types";
import { PlayerCard } from "@/components/moonastery-public/player-card";
import { PlatformIdHelp } from "./platform-id-help";
import { BaselineSettings } from "./baseline-settings";
import { PlayerRecalculation } from "./player-recalculation";
import { DEFAULT_SCORING_SETTINGS } from "@/lib/gameplay-scouter/config";
import { ActionButton, EditorForm, Empty, Panel, type Field, type FormValue } from "./form";
import type { TeamModule } from "./permissions";

const HistoryChart = lazy(() => import("./history-chart"));
const textField = (
  name: string,
  label: string,
  type: Field["type"] = "text",
  required = false,
): Field => ({ name, label, type, required });
const roles = [
  { value: "owner", label: "Gestão" },
  { value: "editor", label: "Editor" },
  { value: "coach", label: "Treinador" },
  { value: "player", label: "Jogador" },
];
const attrs = ["VEL", "FIN", "CRI", "DEF", "POS", "BST", "IMP"] as const;
const statusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  suspended: "Suspenso",
  draft: "Rascunho",
  published: "Publicado",
  changes_requested: "Ajustes solicitados",
  open: "Aberto",
  reviewing: "Em análise",
  resolved: "Resolvido",
  dismissed: "Encerrado",
  processing: "Processando",
  awaiting_review: "Aguardando validação",
  discarded: "Descartado",
  error: "Erro",
};
const staff = (role: Role | null) => role === "owner" || role === "coach";
function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "medium",
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`));
}

export function TeamContent({
  module,
  data,
  onNavigate,
}: {
  module: TeamModule;
  data: DashboardData;
  onNavigate: () => void;
}) {
  switch (module) {
    case "overview":
      return <Overview data={data} onNavigate={onNavigate} />;
    case "ranking":
      return <Ranking data={data} />;
    case "reports":
      return <Reports data={data} />;
    case "instructions":
      return <Instructions data={data} />;
    case "profile":
      return <Profile data={data} />;
    case "submissions":
      return <Submissions data={data} />;
    case "users":
      return <Users data={data} />;
    case "players":
      return <Players data={data} />;
    case "news":
      return <NewsModule data={data} />;
    case "partners":
      return <Partners data={data} />;
    case "socials":
      return <Socials data={data} />;
    case "settings":
      return <Settings data={data} />;
    case "scouter":
      return <Scouter data={data} />;
  }
}

function Overview({ data, onNavigate }: { data: DashboardData; onNavigate: () => void }) {
  const me = data.players.find((player) => player.user_id === data.membership.id);
  const role = data.membership.role;
  const reviewCount = data.jobs.filter((job) => job.status === "awaiting_review").length;
  const pendingCount = data.users.filter((user) => user.status === "pending").length;
  const primaryModule: TeamModule =
    role === "owner"
      ? "users"
      : role === "coach"
        ? "scouter"
        : role === "editor"
          ? "news"
          : "reports";
  const primaryLabel =
    role === "owner"
      ? "Gerenciar acessos"
      : role === "coach"
        ? "Abrir GameplayScouter"
        : role === "editor"
          ? "Trabalhar nas notícias"
          : "Ver meus relatórios";
  const intro =
    role === "owner"
      ? "Acompanhe as solicitações da equipe e mantenha a operação em dia."
      : role === "coach"
        ? "Revise os replays e transforme cada partida em orientação prática."
        : role === "editor"
          ? "Organize as publicações e conte as novidades da Moonastery."
          : "Veja seu progresso e saiba onde concentrar o próximo treino.";
  return (
    <>
      <section className="team-overview-hero" aria-labelledby="overview-title">
        <div className="team-overview-hero-content">
          <p className="team-overview-greeting">Seu espaço na Moonastery</p>
          <h2 id="overview-title">Olá, {data.membership.nick}.</h2>
          <p>{intro}</p>
          <Link
            className="team-button"
            to="/team"
            search={{ module: primaryModule }}
            onClick={onNavigate}
          >
            {primaryLabel}
          </Link>
        </div>
        <img src="/moonastery-icon.png" width="265" height="265" alt="" aria-hidden="true" />
      </section>
      <div className="team-overview-metrics" aria-label="Resumo da equipe">
        {role === "editor" ? (
          <Link to="/team" search={{ module: "news" }} onClick={onNavigate}>
            <strong>{data.news.length}</strong>
            <span>Notícias</span>
          </Link>
        ) : (
          <>
            <Link to="/team" search={{ module: "reports" }} onClick={onNavigate}>
              <strong>{data.reports.length}</strong>
              <span>Relatórios</span>
            </Link>
            <Link to="/team" search={{ module: "instructions" }} onClick={onNavigate}>
              <strong>{data.instructions.length}</strong>
              <span>Planos e instruções</span>
            </Link>
          </>
        )}
        {staff(role) && (
          <Link to="/team" search={{ module: "scouter" }} onClick={onNavigate}>
            <strong>{reviewCount}</strong>
            <span>Replays para revisar</span>
          </Link>
        )}
        {role === "owner" && (
          <Link to="/team" search={{ module: "users" }} onClick={onNavigate}>
            <strong>{pendingCount}</strong>
            <span>Acessos pendentes</span>
          </Link>
        )}
      </div>
      {role === "player" && me && (
        <Panel title="Minha evolução" description="Sua carta acompanha as análises aprovadas.">
          {me.card ? (
            <PlayerCard player={me} />
          ) : (
            <Empty>Sua carta aparece após a primeira análise aprovada pelo treinador.</Empty>
          )}
        </Panel>
      )}
      <Panel title="Para continuar" description="Acesse diretamente o que você precisa fazer.">
        <div className="team-quick-links">
          <Link to="/team" search={{ module: primaryModule }} onClick={onNavigate}>
            <strong>{primaryLabel}</strong>
            <span>{role === "player" ? "Acompanhe suas avaliações." : intro}</span>
          </Link>
          {role === "editor" ? (
            <Link to="/team" search={{ module: "profile" }} onClick={onNavigate}>
              <strong>Atualizar meu perfil</strong>
              <span>Revise seu nome e apresentação.</span>
            </Link>
          ) : (
            <Link to="/team" search={{ module: "instructions" }} onClick={onNavigate}>
              <strong>Ver planos e instruções</strong>
              <span>Consulte as orientações mais recentes.</span>
            </Link>
          )}
          {role === "player" && (
            <Link to="/team" search={{ module: "ranking" }} onClick={onNavigate}>
              <strong>Ver ranking</strong>
              <span>Compare seu desempenho com a equipe.</span>
            </Link>
          )}
        </div>
      </Panel>
      {role !== "editor" && (
        <Panel title="Orientações recentes">
          {data.instructions.slice(0, 3).map((item) => (
            <article key={item.id} className="team-list-item">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
          {!data.instructions.length && <Empty>Nenhuma instrução disponível ainda.</Empty>}
          {data.instructions.length > 0 && (
            <Link
              className="team-text-button"
              to="/team"
              search={{ module: "instructions" }}
              onClick={onNavigate}
            >
              Ver todas as orientações
            </Link>
          )}
        </Panel>
      )}
    </>
  );
}

function Ranking({ data }: { data: DashboardData }) {
  const players = [...data.players].sort(
    (a, b) =>
      (a.ranking_position ?? Number.MAX_SAFE_INTEGER) -
      (b.ranking_position ?? Number.MAX_SAFE_INTEGER),
  );
  const rated = players.filter((player) => player.card?.overall != null);
  return (
    <>
      <Panel
        title="Pódio da Moonastery"
        description="Classificação pelo overall do último relatório aprovado. Empates: impacto, nick e identificação do jogador."
      >
        <div className="team-podium">
          {rated.slice(0, 3).map((player) => (
            <article key={player.id}>
              <h3>#{player.ranking_position}</h3>
              <PlayerCard player={player} />
            </article>
          ))}
        </div>
        {!rated.length && <Empty>O pódio aparecerá quando houver avaliações aprovadas.</Empty>}
      </Panel>
      <Panel title="Todos os jogadores">
        <div className="team-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Posição</th>
                <th>Jogador</th>
                <th>Arquétipo</th>
                <th>Overall</th>
                <th>Evolução</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.ranking_position ?? "—"}</td>
                  <td>{player.nick}</td>
                  <td>{playerArchetypeLabel(player)}</td>
                  <td>{player.card?.overall?.toFixed(2) ?? "Sem avaliação"}</td>
                  <td>
                    {player.card?.evolution == null
                      ? "—"
                      : `${player.card.evolution > 0 ? "+" : ""}${player.card.evolution.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!players.length && <Empty>Nenhum jogador cadastrado.</Empty>}
        {players.length > 0 && (
          <details className="team-ranking-gallery">
            <summary>Explorar cartas dos jogadores</summary>
            <div className="team-card-grid">
              {players.map((player) => (
                <details key={player.id}>
                  <summary>{player.nick}</summary>
                  <PlayerCard player={player} />
                </details>
              ))}
            </div>
          </details>
        )}
      </Panel>
    </>
  );
}

function Reports({ data }: { data: DashboardData }) {
  const [playerId, setPlayerId] = useState(
    data.membership.role === "player"
      ? (data.players.find((player) => player.user_id === data.membership.id)?.id ?? "")
      : (data.players[0]?.id ?? ""),
  );
  const [compare, setCompare] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const reports = data.reports
    .filter((report) => report.player_id === playerId)
    .sort((a, b) => b.session_date.localeCompare(a.session_date));
  const scoredReports = reports.filter((report) => report.source_job_ids.length > 0);
  const player = data.players.find((player) => player.id === playerId);
  const chosen = compare
    .map((id) => scoredReports.find((report) => report.id === id))
    .filter((report): report is Report => Boolean(report));
  return (
    <>
      {data.membership.role === "owner" && (
        <Panel
          title="Relatório para jogador"
          description="Registre sua avaliação por escrito. Relatórios manuais não alteram notas, cartas ou ranking do GameplayScouter."
        >
          {data.players.length ? (
            <>
              <button
                type="button"
                className="team-button team-button-secondary"
                onClick={() => setCreating((current) => !current)}
                aria-expanded={creating}
              >
                {creating ? "Cancelar" : "Criar relatório"}
              </button>
              {creating && (
                <EditorForm
                  key={playerId}
                  action="reports.create"
                  submitLabel="Publicar relatório para o jogador"
                  onSaved={() => setCreating(false)}
                  initial={{
                    player_id: playerId,
                    session_date: new Intl.DateTimeFormat("sv-SE", {
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date()),
                    positives: "",
                    improvements: "",
                    instructions: "",
                    objectives: "",
                    recommendations: "",
                    observations: "",
                  }}
                  fields={[
                    {
                      name: "player_id",
                      label: "Jogador",
                      type: "select",
                      required: true,
                      options: data.players.map((item) => ({ value: item.id, label: item.nick })),
                    },
                    {
                      name: "session_date",
                      label: "Data da avaliação",
                      type: "date",
                      required: true,
                    },
                    ...feedbackFields,
                  ]}
                />
              )}
            </>
          ) : (
            <Empty>Cadastre e aprove um jogador antes de criar relatórios.</Empty>
          )}
        </Panel>
      )}
      <Panel
        title="Histórico de desempenho"
        description="Notas geradas pelas análises aprovadas do GameplayScouter."
      >
        {staff(data.membership.role) && (
          <label className="team-field">
            Jogador
            <select
              value={playerId}
              onChange={(event) => {
                setPlayerId(event.target.value);
                setCompare([]);
              }}
            >
              {data.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.nick}
                </option>
              ))}
            </select>
          </label>
        )}
        {scoredReports.length ? (
          <Suspense fallback={<p role="status">Carregando gráfico…</p>}>
            <HistoryChart reports={scoredReports} />
          </Suspense>
        ) : (
          <Empty>Nenhuma análise válida aprovada para este jogador.</Empty>
        )}
      </Panel>
      {scoredReports.length > 1 && (
        <Panel
          title="Comparar relatórios"
          description="Selecione até dois relatórios para comparar os atributos."
        >
          {scoredReports.map((report) => (
            <label key={report.id} className="team-compare-option">
              <input
                type="checkbox"
                checked={compare.includes(report.id)}
                disabled={compare.length === 2 && !compare.includes(report.id)}
                onChange={(event) =>
                  setCompare((current) =>
                    event.target.checked
                      ? [...current, report.id]
                      : current.filter((id) => id !== report.id),
                  )
                }
              />
              {date(report.session_date)}
            </label>
          ))}
          {chosen.length === 2 && (
            <div className="team-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Atributo</th>
                    <th>{date(chosen[0].session_date)}</th>
                    <th>{date(chosen[1].session_date)}</th>
                    <th>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {attrs.map((attribute) => (
                    <tr key={attribute}>
                      <th>{attribute}</th>
                      <td>{chosen[0].attributes[attribute]?.toFixed(2) ?? "Sem dados"}</td>
                      <td>{chosen[1].attributes[attribute]?.toFixed(2) ?? "Sem dados"}</td>
                      <td>
                        {chosen[0].attributes[attribute] == null ||
                        chosen[1].attributes[attribute] == null
                          ? "—"
                          : (
                              chosen[1].attributes[attribute]! - chosen[0].attributes[attribute]!
                            ).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {reports.length > 0 && (
        <Panel
          title="Avaliações e feedback"
          description="Abra uma sessão para ler a avaliação e as orientações recebidas."
        >
          <div className="team-report-list">
            {reports.map((report, index) => (
              <details key={report.id} className="team-report-item" open={index === 0}>
                <summary>
                  <span>
                    {date(report.session_date)}
                    {report.source_job_ids.length === 0 && " · Relatório da gestão"}
                  </span>
                  <strong>
                    {report.overall == null ? "Sem nota" : `Overall ${report.overall.toFixed(2)}`}
                  </strong>
                </summary>
                <div className="team-report-body">
                  {player && report.source_job_ids.length > 0 && (
                    <PlayerCard
                      player={{
                        ...player,
                        card: {
                          attributes: report.attributes,
                          overall: report.overall,
                          previous_overall: report.previous_overall,
                          evolution:
                            report.overall == null || report.previous_overall == null
                              ? null
                              : report.overall - report.previous_overall,
                          report_id: report.id,
                          approved_at: report.approved_at,
                        },
                      }}
                    />
                  )}
                  <div className="team-feedback">
                    {feedbackFields.map((field) => (
                      <div key={field.name}>
                        <h3>{field.label}</h3>
                        <p>
                          {(report[field.name as keyof Report] as string) ||
                            "Ainda não registrado."}
                        </p>
                      </div>
                    ))}
                  </div>
                  {staff(data.membership.role) && (
                    <details>
                      <summary>Adicionar ou editar feedback qualitativo</summary>
                      <EditorForm
                        action="reports.feedback"
                        initial={{
                          id: report.id,
                          positives: report.positives,
                          improvements: report.improvements,
                          instructions: report.instructions,
                          objectives: report.objectives,
                          recommendations: report.recommendations,
                          observations: report.observations,
                        }}
                        fields={feedbackFields}
                      />
                    </details>
                  )}
                  {data.membership.role === "owner" && (
                    <ActionButton
                      action="reports.delete"
                      payload={{ id: report.id }}
                      confirmation={`Excluir permanentemente o relatório de ${player?.nick ?? "este jogador"} de ${date(report.session_date)}?${report.source_job_ids.length ? " A carta e o ranking serão recalculados usando o relatório anterior." : ""}`}
                    >
                      Excluir relatório
                    </ActionButton>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
const feedbackFields = [
  textField("positives", "Pontos positivos", "textarea"),
  textField("improvements", "Pontos a melhorar", "textarea"),
  textField("instructions", "Instruções individuais", "textarea"),
  textField("objectives", "Objetivos para o próximo treino", "textarea"),
  textField("recommendations", "Recomendações técnicas", "textarea"),
  textField("observations", "Observações", "textarea"),
];

function Profile({ data }: { data: DashboardData }) {
  const player = data.players.find((player) => player.user_id === data.membership.id);
  return (
    <Panel
      title="Meu perfil"
      description="Atualize seu nick, foto, apresentação e conta de jogo. Plataforma e ID permitem que o GameplayScouter reconheça você nos replays."
    >
      <EditorForm
        action="profile.update"
        initial={{
          nick: data.membership.nick,
          bio: player?.bio ?? "",
          photo_url: player?.photo_url ?? null,
          platform: player?.platform ?? null,
          platform_id: player?.platform_id ?? null,
        }}
        fields={[
          textField("nick", "Nick", "text", true),
          textField("bio", "Apresentação", "textarea"),
          {
            name: "photo_url",
            label: "Foto do jogador",
            type: "image",
            purpose: "avatar",
            help: "PNG, JPEG ou WebP de até 5 MB.",
          },
          {
            name: "platform",
            label: "Plataforma do Rocket League",
            type: "select",
            nullable: true,
            options: [
              { value: "steam", label: "Steam" },
              { value: "epic", label: "Epic Games" },
              { value: "ps4", label: "PlayStation" },
              { value: "xbox", label: "Xbox" },
            ],
          },
          {
            name: "platform_id",
            label: "Seu ID na plataforma",
            nullable: true,
            help: (values) => <PlatformIdHelp platform={values.platform} />,
          },
        ]}
      />
    </Panel>
  );
}

function Instructions({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("");
  const categories = [...new Set(data.instructions.map((item) => item.category))];
  const visibleInstructions = data.instructions.filter(
    (item) => !filter || item.category === filter,
  );
  return (
    <>
      <Panel title="Biblioteca técnica">
        <label className="team-field">
          Categoria
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        {!visibleInstructions.length && (
          <Empty>
            {filter
              ? "Nenhuma orientação nesta categoria. Escolha outra categoria para continuar."
              : "As instruções e os planos táticos do treinador aparecerão aqui."}
          </Empty>
        )}
        {visibleInstructions.map((item) => (
          <article className="team-list-item" key={item.id}>
            <p className="team-muted">
              {item.category} · {item.tactical ? "Plano tático" : "Instrução"} ·{" "}
              {date(item.created_at)}
            </p>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div className="team-prose">{item.content}</div>
            <div className="team-media">
              {item.media.map((media, index) =>
                media.type === "image" ? (
                  <a href={media.url} key={index} target="_blank" rel="noopener noreferrer">
                    <img src={media.url} alt={`Imagem da instrução ${item.title}`} loading="lazy" />
                  </a>
                ) : (
                  <a key={index} href={media.url} target="_blank" rel="noopener noreferrer">
                    {media.type === "video" ? "Assistir vídeo" : "Abrir material"}
                  </a>
                ),
              )}
            </div>
            <p className="team-muted">
              Autor:{" "}
              {data.users.find((user) => user.id === item.author_id)?.nick ?? "Coach da Moonastery"}
            </p>
            {staff(data.membership.role) && (
              <details>
                <summary>Editar instrução</summary>
                <InstructionEditor item={item} data={data} />
                <ActionButton
                  action="instructions.delete"
                  payload={{ id: item.id }}
                  confirmation="Excluir esta instrução?"
                >
                  Excluir instrução
                </ActionButton>
              </details>
            )}
          </article>
        ))}
      </Panel>
      {staff(data.membership.role) && (
        <Panel title="Nova instrução ou plano tático">
          <InstructionEditor data={data} />
        </Panel>
      )}
    </>
  );
}
function InstructionEditor({ data, item }: { data: DashboardData; item?: Instruction }) {
  return (
    <EditorForm
      action="instructions.save"
      initial={{
        ...(item ? { id: item.id } : {}),
        title: item?.title ?? "",
        description: item?.description ?? "",
        content: item?.content ?? "",
        category: item?.category ?? "Rotação",
        tactical: item?.tactical ?? false,
        target_player_ids: item?.target_player_ids ?? [],
        media: item?.media ?? [],
      }}
      fields={[
        textField("title", "Título", "text", true),
        textField("description", "Descrição", "textarea"),
        textField("content", "Orientações", "textarea", true),
        textField("category", "Categoria", "text", true),
        { name: "tactical", label: "Plano tático coletivo", type: "checkbox" },
        {
          name: "target_player_ids",
          label: "Jogadores destinatários",
          type: "multi",
          options: data.players.map((player) => ({ value: player.id, label: player.nick })),
          help: "Sem seleção, o conteúdo fica disponível para toda a equipe.",
        },
        { name: "media", label: "Materiais de apoio", type: "media" },
      ]}
    />
  );
}

function Users({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("pending");
  return (
    <>
      <Panel title="Aprovação e permissões">
        <label className="team-field">
          Status
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Todos</option>
            {["pending", "approved", "rejected", "suspended"].map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {data.users
          .filter((user) => !filter || user.status === filter)
          .map((user) => (
            <article className="team-list-item" key={user.id}>
              <h3>{user.nick}</h3>
              <p>{user.email}</p>
              <p className="team-muted">
                {statusLabels[user.status]} · {user.role ?? "Sem função"}
              </p>
              {user.id === data.membership.id ? (
                <p>Sua função e aprovação não podem ser alteradas pela sua própria conta.</p>
              ) : (
                <details>
                  <summary>Gerenciar acesso</summary>
                  <EditorForm
                    action="users.update"
                    initial={{ id: user.id, status: user.status, role: user.role }}
                    fields={[
                      {
                        name: "status",
                        label: "Status",
                        type: "select",
                        options: ["pending", "approved", "rejected", "suspended"].map((value) => ({
                          value,
                          label: statusLabels[value],
                        })),
                      },
                      {
                        name: "role",
                        label: "Função",
                        type: "select",
                        nullable: true,
                        options: roles,
                      },
                    ]}
                  />
                  <ActionButton
                    action="users.remove"
                    payload={{ id: user.id }}
                    confirmation={`Remover permanentemente a conta de ${user.nick}? Os dados vinculados também serão removidos.`}
                  >
                    Remover usuário
                  </ActionButton>
                </details>
              )}
            </article>
          ))}
        {!data.users.filter((user) => !filter || user.status === filter).length && (
          <Empty>Nenhum usuário com este status nesta página.</Empty>
        )}
      </Panel>
      <Panel
        title="Convidar usuário"
        description="Envia um convite para o e-mail informado. A função será atribuída pelo owner."
      >
        <EditorForm
          action="users.create"
          initial={{ email: "", nick: "", role: "player" }}
          fields={[
            textField("email", "E-mail", "text", true),
            textField("nick", "Nick", "text", true),
            { name: "role", label: "Função", type: "select", options: roles },
          ]}
          submitLabel="Enviar convite"
        />
      </Panel>
    </>
  );
}

function Players({ data }: { data: DashboardData }) {
  return (
    <Panel
      title="Cartinhas da equipe e arquétipos"
      description="Identifique as contas Steam, Epic, PlayStation ou Xbox usadas nos replays. O nick sozinho não identifica um participante com segurança."
    >
      {!data.players.length && (
        <Empty>
          As cartinhas aparecerão quando contas forem aprovadas como jogador, coach ou dono.
        </Empty>
      )}
      {data.players.map((player) => (
        <article className="team-list-item" key={player.id}>
          <h3>{player.nick}</h3>
          <div className="team-player-admin">
            <PlayerCard player={player} />
            <div>
              {player.role === "coach" || player.role === "owner" ? (
                <p>Arquétipo: {playerArchetypeLabel(player)}</p>
              ) : (
                <EditorForm
                  action="players.archetype"
                  initial={{
                    id: player.id,
                    archetype_id: player.archetype_id ?? data.archetypes[0]?.id ?? "",
                  }}
                  fields={[
                    {
                      name: "archetype_id",
                      label: "Arquétipo",
                      type: "select",
                      required: true,
                      options: data.archetypes
                        .filter((item) => item.active)
                        .map((item) => ({ value: item.id, label: item.name })),
                    },
                  ]}
                  submitLabel="Alterar arquétipo e recalcular overall"
                />
              )}
              <details>
                <summary>Recalcular métricas de {player.nick}</summary>
                <PlayerRecalculation players={[player]} />
              </details>
              <details>
                <summary>Conta do jogo e informações públicas</summary>
                <EditorForm
                  action="players.update"
                  initial={{
                    id: player.id,
                    nick: player.nick,
                    bio: player.bio,
                    game_id: player.game_id,
                    platform: player.platform,
                    platform_id: player.platform_id,
                    public_visible: player.public_visible,
                  }}
                  fields={[
                    textField("nick", "Nick", "text", true),
                    textField("bio", "Apresentação", "textarea"),
                    {
                      name: "game_id",
                      label: "Modalidade",
                      type: "select",
                      nullable: true,
                      options: data.games.map((game) => ({ value: game.id, label: game.name })),
                    },
                    {
                      name: "platform",
                      label: "Plataforma do replay",
                      type: "select",
                      nullable: true,
                      options: [
                        { value: "steam", label: "Steam" },
                        { value: "epic", label: "Epic Games" },
                        { value: "ps4", label: "PlayStation (PS4)" },
                        { value: "xbox", label: "Xbox" },
                      ],
                    },
                    {
                      name: "platform_id",
                      label: "ID da conta na plataforma",
                      nullable: true,
                      help: (values) => <PlatformIdHelp platform={values.platform} />,
                    },
                    { name: "public_visible", label: "Exibir no site público", type: "checkbox" },
                  ]}
                />
              </details>
            </div>
          </div>
        </article>
      ))}
    </Panel>
  );
}

function NewsModule({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("");
  const visibleNews = data.news.filter((news) => !filter || news.status === filter);
  return (
    <>
      <Panel
        title="Notícias e conquistas"
        description="Rascunhos enviados por editores dependem da aprovação de um owner."
      >
        <label className="team-field">
          Status
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Todos</option>
            {["draft", "pending", "changes_requested", "rejected", "published"].map((status) => (
              <option value={status} key={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {visibleNews.map((news) => (
          <article className="team-list-item" key={news.id}>
            <h3>{news.title}</h3>
            <p>
              {statusLabels[news.status]} · {news.category}
            </p>
            {news.review_note && (
              <p className="team-notice">Observação do owner: {news.review_note}</p>
            )}
            {news.status === "published" && (
              <a href={`/noticias/${news.slug}`} target="_blank" rel="noopener noreferrer">
                Ver publicação
              </a>
            )}
            {(data.membership.role === "owner" ||
              ["draft", "changes_requested", "rejected"].includes(news.status)) && (
              <details>
                <summary>Editar notícia</summary>
                <NewsEditor news={news} />
              </details>
            )}
            {["draft", "changes_requested", "rejected"].includes(news.status) && (
              <ActionButton action="news.submit" payload={{ id: news.id }}>
                Enviar para aprovação
              </ActionButton>
            )}
            {data.membership.role === "owner" && (
              <details>
                <summary>Aprovar ou solicitar alterações</summary>
                <EditorForm
                  action="news.review"
                  initial={{ id: news.id, status: "published", review_note: "" }}
                  fields={[
                    {
                      name: "status",
                      label: "Decisão editorial",
                      type: "select",
                      options: [
                        { value: "published", label: "Aprovar e publicar" },
                        { value: "changes_requested", label: "Solicitar ajustes" },
                        { value: "rejected", label: "Reprovar" },
                      ],
                    },
                    textField("review_note", "Observação para o editor", "textarea"),
                  ]}
                />
                <ActionButton
                  action="news.delete"
                  payload={{ id: news.id }}
                  confirmation="Excluir esta notícia?"
                >
                  Excluir notícia
                </ActionButton>
              </details>
            )}
          </article>
        ))}
        {!visibleNews.length && (
          <Empty>
            {filter
              ? "Nenhuma notícia com este status. Selecione outro status."
              : "Nenhuma notícia cadastrada."}
          </Empty>
        )}
      </Panel>
      <Panel title="Criar notícia">
        <NewsEditor />
      </Panel>
    </>
  );
}
function NewsEditor({ news }: { news?: News }) {
  return (
    <EditorForm
      action="news.save"
      initial={{
        ...(news ? { id: news.id } : {}),
        title: news?.title ?? "",
        slug: news?.slug ?? "",
        summary: news?.summary ?? "",
        content: news?.content ?? "",
        cover_url: news?.cover_url ?? null,
        category: news?.category ?? "Equipe",
      }}
      fields={[
        textField("title", "Título", "text", true),
        {
          name: "slug",
          label: "Endereço da notícia",
          required: true,
          help: "Use letras minúsculas, números e hífens. Exemplo: nova-conquista.",
        },
        textField("summary", "Resumo", "textarea"),
        textField("content", "Conteúdo completo", "textarea", true),
        { name: "cover_url", label: "Imagem de capa", type: "image" },
        textField("category", "Categoria", "text", true),
      ]}
      submitLabel="Salvar rascunho"
    />
  );
}

function Submissions({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("");
  const visibleSubmissions = data.submissions.filter((item) => !filter || item.category === filter);
  const categories = [
    { value: "suggestion", label: "Sugestão" },
    { value: "technical", label: "Problema técnico" },
    { value: "complaint", label: "Denúncia" },
    { value: "other", label: "Outros" },
  ];
  return (
    <>
      {data.membership.role === "player" && (
        <Panel
          title="Enviar denúncia ou sugestão"
          description="Somente você e os owners têm acesso ao seu envio."
        >
          <EditorForm
            action="submissions.create"
            initial={{ category: "suggestion", title: "", description: "" }}
            fields={[
              { name: "category", label: "Categoria", type: "select", options: categories },
              textField("title", "Título", "text", true),
              textField("description", "Descrição", "textarea", true),
            ]}
            submitLabel="Enviar"
          />
        </Panel>
      )}
      <Panel title={data.membership.role === "owner" ? "Gerenciar envios" : "Meus envios"}>
        <label className="team-field">
          Categoria
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Todas</option>
            {categories.map((category) => (
              <option value={category.value} key={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        {visibleSubmissions.map((item) => (
          <article className="team-list-item" key={item.id}>
            <p className="team-muted">
              {date(item.created_at)} · {statusLabels[item.status]}
              {data.membership.role === "owner" && !item.author_id && " · Público sem login"}
            </p>
            <h3>{item.title}</h3>
            <p className="team-prose">{item.description}</p>
            {item.response && <p className="team-notice">Resposta do owner: {item.response}</p>}
            {data.membership.role === "owner" && (
              <EditorForm
                action="submissions.update"
                initial={{ id: item.id, status: item.status, response: item.response }}
                fields={[
                  {
                    name: "status",
                    label: "Status",
                    type: "select",
                    options: ["open", "reviewing", "resolved", "dismissed"].map((value) => ({
                      value,
                      label: statusLabels[value],
                    })),
                  },
                  textField("response", "Resposta ou observação administrativa", "textarea"),
                ]}
              />
            )}
          </article>
        ))}
        {!visibleSubmissions.length && (
          <Empty>
            {filter
              ? "Nenhum envio nesta categoria. Selecione outra categoria."
              : "Nenhum envio disponível."}
          </Empty>
        )}
      </Panel>
    </>
  );
}

function Partners({ data }: { data: DashboardData }) {
  const fields: Field[] = [
    textField("name", "Nome", "text", true),
    textField("description", "Descrição", "textarea"),
    { name: "logo_url", label: "Logo", type: "image" },
    { name: "url", label: "Site do parceiro", nullable: true },
    { name: "active", label: "Exibir no site", type: "checkbox" },
    textField("display_order", "Ordem de exibição", "number"),
  ];
  return (
    <>
      <Panel title="Parceiros cadastrados">
        {data.partners.map((partner) => (
          <article className="team-list-item" key={partner.id}>
            <h3>{partner.name}</h3>
            <details>
              <summary>Editar parceiro</summary>
              <EditorForm
                action="partners.save"
                initial={{
                  id: partner.id,
                  name: partner.name,
                  description: partner.description,
                  logo_url: partner.logo_url,
                  url: partner.url,
                  active: partner.active,
                  display_order: partner.display_order,
                }}
                fields={fields}
              />
              <ActionButton
                action="partners.delete"
                payload={{ id: partner.id }}
                confirmation="Excluir este parceiro?"
              >
                Excluir parceiro
              </ActionButton>
            </details>
          </article>
        ))}
        {!data.partners.length && <Empty>Nenhum parceiro cadastrado.</Empty>}
      </Panel>
      <Panel title="Cadastrar parceiro">
        <EditorForm
          action="partners.save"
          initial={{
            name: "",
            description: "",
            logo_url: null,
            url: null,
            active: true,
            display_order: 0,
          }}
          fields={fields}
        />
      </Panel>
    </>
  );
}
function Socials({ data }: { data: DashboardData }) {
  const platforms = ["Instagram", "X", "YouTube", "TikTok", "Twitch", "Discord", "Outras"];
  const fields: Field[] = [
    textField("platform", "Nome da rede", "text", true),
    {
      name: "icon",
      label: "Ícone",
      type: "select",
      options: platforms.map((value) => ({ value: value.toLowerCase(), label: value })),
    },
    textField("url", "URL oficial", "text", true),
    { name: "active", label: "Exibir no site", type: "checkbox" },
    textField("display_order", "Ordem de exibição", "number"),
  ];
  return (
    <>
      <Panel title="Redes sociais cadastradas">
        {data.socials.map((social) => (
          <article key={social.id} className="team-list-item">
            <h3>{social.platform}</h3>
            <a href={social.url} target="_blank" rel="noopener noreferrer">
              {social.url}
            </a>
            <details>
              <summary>Editar rede social</summary>
              <EditorForm
                action="socials.save"
                initial={{
                  id: social.id,
                  platform: social.platform,
                  icon: social.icon,
                  url: social.url,
                  active: social.active,
                  display_order: social.display_order,
                }}
                fields={fields}
              />
              <ActionButton
                action="socials.delete"
                payload={{ id: social.id }}
                confirmation="Excluir esta rede social?"
              >
                Excluir rede social
              </ActionButton>
            </details>
          </article>
        ))}
        {!data.socials.length && <Empty>Nenhuma rede social cadastrada.</Empty>}
      </Panel>
      <Panel title="Cadastrar rede social">
        <EditorForm
          action="socials.save"
          initial={{ platform: "", icon: "instagram", url: "", active: true, display_order: 0 }}
          fields={fields}
        />
      </Panel>
    </>
  );
}

function Settings({ data }: { data: DashboardData }) {
  const org = data.organization;
  const gameFields: Field[] = [
    textField("name", "Nome", "text", true),
    textField("slug", "Identificador da modalidade", "text", true),
    textField("description", "Descrição", "textarea"),
    { name: "image_url", label: "Imagem da modalidade", type: "image" },
    { name: "active", label: "Exibir no site", type: "checkbox" },
    textField("display_order", "Ordem de exibição", "number"),
  ];
  return (
    <>
      <Panel title="Informações da organização">
        <EditorForm
          action="organization.save"
          initial={{
            name: org?.name ?? "Moonastery E-Sports",
            description: org?.description ?? "",
            hero_title: org?.hero_title ?? "",
            hero_subtitle: org?.hero_subtitle ?? "",
            contact_email: org?.contact_email ?? null,
          }}
          fields={[
            textField("name", "Nome da organização", "text", true),
            textField("description", "Descrição institucional", "textarea"),
            textField("hero_title", "Título principal do site", "text", true),
            textField("hero_subtitle", "Texto principal do site", "textarea"),
            { name: "contact_email", label: "E-mail de contato público", nullable: true },
          ]}
        />
      </Panel>
      <Panel title="Modalidades">
        {data.games.map((game) => (
          <details className="team-list-item" key={game.id}>
            <summary>{game.name}</summary>
            <EditorForm
              action="games.save"
              initial={{
                id: game.id,
                name: game.name,
                slug: game.slug,
                description: game.description,
                image_url: game.image_url,
                active: game.active,
                display_order: game.display_order,
              }}
              fields={gameFields}
            />
            <ActionButton
              action="games.delete"
              payload={{ id: game.id }}
              confirmation="Excluir esta modalidade?"
            >
              Excluir modalidade
            </ActionButton>
          </details>
        ))}
        <h3>Nova modalidade</h3>
        <EditorForm
          action="games.save"
          initial={{
            name: "",
            slug: "",
            description: "",
            image_url: null,
            active: true,
            display_order: 0,
          }}
          fields={gameFields}
        />
      </Panel>
      <Panel
        title="Arquétipos e pesos"
        description="Os pesos dos sete atributos devem somar 1. A mudança de função preserva as métricas das partidas."
      >
        {data.archetypes.map((archetype) => (
          <details className="team-list-item" key={archetype.id}>
            <summary>{archetype.name}</summary>
            <ArchetypeEditor archetype={archetype} />
            <ActionButton
              action="archetypes.delete"
              payload={{ id: archetype.id }}
              confirmation="Excluir este arquétipo?"
            >
              Excluir arquétipo
            </ActionButton>
          </details>
        ))}
        <h3>Novo arquétipo</h3>
        <ArchetypeEditor />
      </Panel>
      <Panel
        title="Baseline por jogador"
        description="Escolha o jogador pelo ID e use seus replays como referência em todos os modos, sem preencher médias e desvios manualmente."
      >
        <BaselineSettings data={data} />
        <a href="/team?module=scouter">Consultar o processamento de replays</a>
        <details>
          <summary>Configuração avançada de avaliação</summary>
          <EditorForm
            key={JSON.stringify(data.scoring)}
            action="scoring.save"
            initial={{ config: data.scoring ?? DEFAULT_SCORING_SETTINGS }}
            fields={[
              {
                name: "config",
                label: "Parâmetros de avaliação e baselines",
                type: "json",
                help: "Ajuste pesos, escala e baselines manuais por modo. Alterações valem apenas para novas análises ou reprocessamentos.",
              },
            ]}
            submitLabel="Salvar parâmetros de avaliação"
          />
        </details>
      </Panel>
    </>
  );
}
function ArchetypeEditor({ archetype }: { archetype?: Archetype }) {
  return (
    <EditorForm
      action="archetypes.save"
      initial={{
        ...(archetype ? { id: archetype.id } : {}),
        name: archetype?.name ?? "",
        description: archetype?.description ?? "",
        weights: archetype?.weights ?? {
          VEL: 0.1,
          FIN: 0.15,
          CRI: 0.15,
          DEF: 0.15,
          POS: 0.2,
          BST: 0.1,
          IMP: 0.15,
        },
        active: archetype?.active ?? true,
      }}
      fields={[
        textField("name", "Nome", "text", true),
        textField("description", "Descrição", "textarea"),
        { name: "weights", label: "Pesos dos atributos", type: "weights" },
        { name: "active", label: "Disponível para jogadores", type: "checkbox" },
      ]}
    />
  );
}

function Scouter({ data }: { data: DashboardData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  async function ingest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    try {
      if (
        !(file instanceof File) ||
        !file.name.toLowerCase().endsWith(".replay") ||
        !file.size ||
        file.size > 20 * 1024 * 1024
      )
        throw new Error("Envie um arquivo .replay de até 20 MB.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch("/api/scouter", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível enviar o replay.");
      await cache.invalidateQueries({ queryKey: ["moon-team"] });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro no envio.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="Enviar replay"
        description="Envie partidas Rocket League para análise. As cartas só mudam após a aprovação do coach."
      >
        <form onSubmit={ingest} className="team-form">
          <label className="team-field">
            Arquivo de replay
            <input name="file" type="file" accept=".replay" required />
          </label>
          <p className="team-muted">
            Até 20 MB. A data da noite é identificada na partida, no fuso de São Paulo.
          </p>
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          <button className="team-button" disabled={busy}>
            {busy ? "Enviando…" : "Enviar para análise"}
          </button>
        </form>
      </Panel>
      <Panel
        title="Recalcular por jogador"
        description="Atualize as métricas usando todos os replays já analisados do jogador, incluindo os aprovados."
      >
        <PlayerRecalculation players={data.players} />
      </Panel>
      <Panel
        title="Fila de processamento"
        description="Verifique as métricas extraídas antes de aprovar. Replays duplicados não contam novamente."
      >
        {!data.jobs.length && <Empty>Nenhum replay recebido ainda.</Empty>}
        {data.jobs.map((job) => (
          <ReplayReview key={job.id} job={job} />
        ))}
      </Panel>
    </>
  );
}
function ReplayReview({ job }: { job: ReplayJob }) {
  return (
    <article className="team-list-item">
      <h3>Replay · {job.session_date ? date(job.session_date) : date(job.created_at)}</h3>
      <p>
        {statusLabels[job.status]} · Tentativa {job.attempt}
      </p>
      {job.error_message && <p className="team-error">{job.error_message}</p>}
      <details>
        <summary>Ver análise e participantes</summary>
        <JobDetails job={job} />
      </details>
      <div className="team-actions">
        {job.status === "pending" && <ProcessButton id={job.id} />}
        {job.status === "awaiting_review" && (
          <>
            <ActionButton action="jobs.approve" payload={{ id: job.id }}>
              Aprovar análise e atualizar cartas
            </ActionButton>
            <DiscardForm id={job.id} />
          </>
        )}
        {["error", "discarded", "awaiting_review"].includes(job.status) && (
          <ActionButton
            action="jobs.reprocess"
            payload={{ id: job.id }}
            confirmation="Reprocessar este replay? A revisão será substituída sem contabilizar a partida novamente."
          >
            Reprocessar
          </ActionButton>
        )}
      </div>
    </article>
  );
}
function DiscardForm({ id }: { id: string }) {
  return (
    <details>
      <summary>Descartar análise</summary>
      <EditorForm
        action="jobs.discard"
        initial={{ id, reason: "" }}
        fields={[textField("reason", "Motivo do descarte", "textarea", true)]}
        submitLabel="Descartar"
      />
    </details>
  );
}
function ProcessButton({ id }: { id: string }) {
  return (
    <ActionButton
      action={"jobs.process" as import("@/lib/moonastery/schemas").MoonAction}
      payload={{ id }}
    >
      Processar agora
    </ActionButton>
  );
}
function JobDetails({ job }: { job: ReplayJob }) {
  const query = useQuery({
    queryKey: ["moon-team", "job", job.id, job.updated_at],
    queryFn: () =>
      moonRequest<{
        job: {
          config_snapshot: {
            baseline?: {
              version?: string;
              playlist?: string;
              cohort?: string;
              metrics?: Record<string, unknown>;
            } | null;
            reference_player?: { nick: string } | null;
          } | null;
        };
        players: {
          player_id: string;
          player: { nick: string } | null;
          config_snapshot: {
            baseline?: { version?: string; cohort?: string; playlist?: string } | null;
          } | null;
          attributes: Record<string, number | null>;
          raw_metrics: Record<string, number | null>;
          confidence: unknown;
          alerts: unknown;
        }[];
      }>("jobs.detail" as import("@/lib/moonastery/schemas").MoonAction, { id: job.id }),
    retry: false,
  });
  if (query.isPending) return <p role="status">Carregando análise…</p>;
  if (query.error)
    return (
      <p className="team-error" role="alert">
        {query.error.message}
      </p>
    );
  const baseline = query.data?.job.config_snapshot?.baseline;
  return (
    <>
      <p className="team-muted" role="status">
        {baseline
          ? `Configuração original da análise: ${baseline.cohort === "GENERIC" ? "referência genérica provisória" : baseline.cohort === "PLAYER" ? "referência individual" : "baseline SSL"} · ${baseline.version ?? "sem versão"} · ${baseline.playlist === "*" ? "todos os modos" : (baseline.playlist ?? "modalidade desconhecida")} · ${Object.keys(baseline.metrics ?? {}).length} métricas. A referência atual de cada participante aparece abaixo.`
          : query.data?.job.config_snapshot?.reference_player
            ? `Referência de ${query.data.job.config_snapshot.reference_player.nick} selecionada, mas ainda sem amostras suficientes para este modo. Processe mais replays desse jogador e depois reprocese esta análise.`
            : "A configuração original desta análise não usou baseline. Confira a referência usada nas métricas de cada jogador abaixo."}
      </p>
      {query.data?.players.length ? (
        query.data.players.map((player) => (
          <div key={player.player_id}>
            <h4>{player.player?.nick || "Participante identificado"}</h4>
            <p className="team-muted">ID do jogador: {player.player_id}</p>
            <p className="team-muted">
              Referência usada nas métricas:{" "}
              {player.config_snapshot?.baseline?.version ??
                "sem baseline disponível para este modo"}
            </p>
            <div className="team-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Atributo</th>
                    <th>Nota calculada</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(player.attributes).map(([attribute, value]) => (
                    <tr key={attribute}>
                      <th>{attribute}</th>
                      <td>{value == null ? "Dados insuficientes" : value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Métricas extraídas e confiabilidade</summary>
              <pre>
                {JSON.stringify(
                  {
                    metricas: player.raw_metrics,
                    confiabilidade: player.confidence,
                    motivos: (player.confidence as { reasons?: unknown } | null)?.reasons ?? [],
                    alertas: player.alerts,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        ))
      ) : (
        <Empty>A análise ainda não tem participantes identificados com dados disponíveis.</Empty>
      )}
    </>
  );
}
