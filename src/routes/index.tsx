import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/capixaba-logo.png";
import {
  Swords, LogIn, ClipboardList, UserPlus, MessageCircle, CalendarCheck,
  CheckCircle2, Users, User as UserIcon, Menu,
} from "lucide-react";
import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Capixaba E-Sports - Time de E-Sports Capixaba" },
      { name: "description", content: "Time capixaba de E-Sports. Conheça a equipe, veja os jogos e junte-se ao projeto." },
    ],
  }),
  component: Landing,
});

const DISCORD_URL = "https://discord.gg/zXFKNtwkGz";

type Section = "sobre" | "jogadores" | "inscricao";

function Landing() {
  const [tab, setTab] = useState<Section>("sobre");
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: Section) => {
    setTab(id);
    setMenuOpen(false);
    // Espera o layout render/troca de tab, depois faz scroll
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/25 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-accent/25 blur-3xl pointer-events-none" />

      {/* Nav */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="Capixaba" className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_20px_rgba(80,140,255,0.5)]" />
          <span className="font-black tracking-tight text-sm sm:text-base truncate">
            <span className="text-primary">CAPIXABA</span> <span className="text-accent">E-SPORTS</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavBtn active={tab === "sobre"} onClick={() => scrollTo("sobre")}>Sobre</NavBtn>
          <NavBtn active={tab === "jogadores"} onClick={() => scrollTo("jogadores")}>Jogadores</NavBtn>
          <Link to="/jogos" className="rounded-md px-3 py-1.5 hover:bg-white/5 transition text-muted-foreground hover:text-foreground">Jogos</Link>
          <NavBtn active={tab === "inscricao"} onClick={() => scrollTo("inscricao")}>Inscrição</NavBtn>
          <Link to="/auth" className="ml-2 rounded-full bg-primary text-primary-foreground px-4 py-1.5 font-bold hover:shadow-[var(--shadow-glow)] transition inline-flex items-center gap-1.5">
            <LogIn className="h-4 w-4" /> Entrar
          </Link>
        </nav>

        {/* Mobile menu */}
        <div className="md:hidden flex items-center gap-2">
          <Link to="/auth" className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1">
            <LogIn className="h-3.5 w-3.5" /> Entrar
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button aria-label="Menu" className="glass rounded-md p-2">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                <MobileLink onClick={() => scrollTo("sobre")}>Sobre o time</MobileLink>
                <MobileLink onClick={() => scrollTo("jogadores")}>Jogadores</MobileLink>
                <Link onClick={() => setMenuOpen(false)} to="/jogos" className="rounded-lg glass px-4 py-3 font-medium">
                  Ver jogos
                </Link>
                <MobileLink onClick={() => scrollTo("inscricao")}>Como me inscrever</MobileLink>
                <a onClick={() => setMenuOpen(false)} href={DISCORD_URL} target="_blank" rel="noreferrer" className="rounded-lg glass px-4 py-3 font-medium">
                  🎧 Discord
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-4 sm:px-8 pt-6 sm:pt-10 pb-10 sm:pb-16 max-w-6xl mx-auto">
        <div className="glass rounded-3xl p-6 sm:p-12 animate-fade-in">
          <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 items-center">
            <img src={logo} alt="Capixaba E-Sports" className="w-56 sm:w-72 md:w-80 mx-auto md:mx-0 drop-shadow-[0_0_40px_rgba(80,140,255,0.5)]" />
            <div className="text-center md:text-left">
              <div className="inline-block rounded-full glass px-4 py-1 text-[10px] sm:text-xs uppercase tracking-widest text-primary mb-3 sm:mb-4">
                Time de E-Sports · Espírito Santo
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight">
                <span className="text-gradient">CAPIXABA</span>
                <br />
                <span className="text-accent">E-SPORTS</span>
              </h1>
              <p className="mt-4 sm:mt-5 max-w-xl text-muted-foreground text-sm sm:text-base">
                Somos um time capixaba de E-Sports — nascido no Espírito Santo, movido pela paixão de transformar
                talento local em cenário competitivo forte, unido e reconhecido.
              </p>
              <div className="mt-5 sm:mt-6 flex flex-wrap gap-2 sm:gap-3 justify-center md:justify-start">
                <Link to="/jogos" className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-bold hover:shadow-[var(--shadow-glow)] hover:scale-[1.03] transition-all">
                  <Swords className="h-4 w-4 sm:h-5 sm:w-5" /> Ver jogos
                </Link>
                <button onClick={() => scrollTo("jogadores")} className="inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-medium hover:shadow-[var(--shadow-glow)] transition-all">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" /> Nossos jogadores
                </button>
                <button onClick={() => scrollTo("inscricao")} className="inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-medium hover:shadow-[var(--shadow-glow)] transition-all">
                  <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" /> Inscrever
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section switcher chips (mobile-first) */}
      <div className="md:hidden sticky top-0 z-20 glass border-y border-white/10 -mt-2 mb-4">
        <div className="max-w-6xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={tab === "sobre"} onClick={() => scrollTo("sobre")}>Sobre</Chip>
          <Chip active={tab === "jogadores"} onClick={() => scrollTo("jogadores")}>Jogadores</Chip>
          <Link to="/jogos" className="text-xs px-3 py-1.5 rounded-full glass text-muted-foreground shrink-0">Jogos</Link>
          <Chip active={tab === "inscricao"} onClick={() => scrollTo("inscricao")}>Inscrição</Chip>
        </div>
      </div>

      {/* Sobre */}
      <section id="sobre" className="relative z-10 px-4 sm:px-8 pb-12 sm:pb-16 max-w-6xl mx-auto scroll-mt-24">
        <h2 className="text-2xl sm:text-3xl font-black mb-5">
          Sobre a <span className="text-gradient">nossa equipe</span>
        </h2>
        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
          <FeatureCard emoji="🚀" title="Projeto capixaba">
            Uma equipe formada por jogadores do Espírito Santo, com foco em desenvolver o cenário local de E-Sports.
          </FeatureCard>
          <FeatureCard emoji="🏆" title="Competitivo de verdade">
            Treinos organizados, análise de desempenho semanal e participação em campeonatos oficiais.
          </FeatureCard>
          <FeatureCard emoji="💙🩷" title="Comunidade unida">
            Mais do que um time — uma comunidade que apoia jogadores, criadores e organizadores.
          </FeatureCard>
        </div>
      </section>

      {/* Jogadores */}
      <section id="jogadores" className="relative z-10 px-4 sm:px-8 pb-12 sm:pb-16 max-w-6xl mx-auto scroll-mt-24">
        <div className="flex items-end justify-between mb-5 flex-wrap gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black">
              <span className="text-gradient">Jogadores</span> do time
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Membros aprovados da Capixaba E-Sports.</p>
          </div>
        </div>
        <PlayersGrid />
      </section>

      {/* Inscrição */}
      <section id="inscricao" className="relative z-10 px-4 sm:px-8 pb-16 sm:pb-20 max-w-6xl mx-auto scroll-mt-24">
        <div className="glass rounded-3xl p-6 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-black mb-2">
            Como fazer sua <span className="text-gradient">inscrição</span>
          </h2>
          <p className="text-muted-foreground text-sm mb-6 sm:mb-8">
            O caminho oficial para novos candidatos é <strong>sempre pelo formulário completo</strong>.
          </p>

          <ol className="space-y-3 sm:space-y-4">
            <Step icon={<UserPlus className="h-5 w-5" />} n={1} title="Crie sua conta">
              Clique em <Link to="/auth" className="text-primary hover:underline">Entrar</Link> e cadastre-se com seu e-mail.
            </Step>
            <Step icon={<ClipboardList className="h-5 w-5" />} n={2} title="Preencha o formulário completo">
              Conte sobre você: nick, rank, plataforma e objetivos. Informe também <strong>datas e horários disponíveis para reunião</strong> — obrigatório.
            </Step>
            <Step icon={<CalendarCheck className="h-5 w-5" />} n={3} title="Aguarde a reunião ser marcada">
              A administração vai analisar e marcar reunião no Discord. A data aparecerá na sua candidatura. <strong>Fique atento!</strong>
            </Step>
            <Step icon={<MessageCircle className="h-5 w-5" />} n={4} title="Participe da reunião no Discord">
              No horário combinado, entre no Discord para conversarmos.
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-md glass-strong px-4 py-2 text-primary hover:shadow-[var(--shadow-glow)] transition text-sm">
                🎧 Entrar no Discord da Capixaba
              </a>
            </Step>
            <Step icon={<CheckCircle2 className="h-5 w-5" />} n={5} title="Aprovação e acesso ao time">
              Se aprovado, você acessa todas as ferramentas: relatórios, treinos, ranking, evolução e mais.
            </Step>
          </ol>

          <div className="mt-6 sm:mt-8 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 text-xs sm:text-sm">
            ⚠️ <strong>Atenção:</strong> "Solicitar sem formulário" é exclusivo para pessoas convidadas pela administração. Sem convite, use o formulário completo.
          </div>

          <div className="mt-5 sm:mt-6 flex flex-wrap gap-2 sm:gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 sm:px-6 sm:py-3 font-bold text-sm sm:text-base hover:shadow-[var(--shadow-glow)] hover:scale-[1.03] transition-all">
              <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" /> Começar minha inscrição
            </Link>
            <Link to="/jogos" className="inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 sm:px-6 sm:py-3 font-medium text-sm sm:text-base hover:shadow-[var(--shadow-glow)] transition-all">
              <Swords className="h-4 w-4 sm:h-5 sm:w-5" /> Ver jogos primeiro
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-muted-foreground relative z-10 px-4">
        © Capixaba E-Sports · Espírito Santo · <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-primary">Discord</a>
      </footer>
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 transition ${active ? "text-primary bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
      {children}
    </button>
  );
}

function MobileLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-left rounded-lg glass px-4 py-3 font-medium">
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition ${active ? "bg-primary text-primary-foreground font-bold" : "glass text-muted-foreground"}`}
    >{children}</button>
  );
}

function FeatureCard({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="text-2xl sm:text-3xl mb-2">{emoji}</div>
      <div className="font-bold mb-1">{title}</div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 sm:gap-4 rounded-2xl glass p-4 sm:p-5">
      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary/20 text-primary font-black">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-bold mb-1 text-sm sm:text-base">{icon} {title}</div>
        <div className="text-xs sm:text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

type PublicPlayer = {
  id: string;
  nick: string | null;
  avatar_url: string | null;
  rank_2v2: string | null;
  mmr_2v2: number | null;
  rank_3v3: string | null;
  mmr_3v3: number | null;
  platform: string | null;
};

function PlayersGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-roster"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,nick,avatar_url,rank_2v2,mmr_2v2,rank_3v3,mmr_3v3,platform")
        .eq("status", "aprovado")
        .order("mmr_3v3", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as PublicPlayer[];
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Carregando jogadores...</p>;
  if (!data || data.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 sm:p-8 text-center">
        <p className="text-muted-foreground text-sm">Nenhum jogador aprovado ainda. Seja o primeiro a se inscrever!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {data.map((p) => (
        <div key={p.id} className="glass rounded-2xl p-4 sm:p-5 text-center hover:shadow-[var(--shadow-glow)] transition">
          <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-primary/40 bg-primary/10 grid place-items-center mb-3">
            {p.avatar_url
              ? <img src={p.avatar_url} alt={p.nick ?? ""} className="w-full h-full object-cover" />
              : <UserIcon className="h-8 w-8 text-primary/60" />}
          </div>
          <div className="font-black text-sm sm:text-base truncate text-gradient">{p.nick ?? "Jogador"}</div>
          {(p.rank_3v3 || p.rank_2v2) && (
            <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
              {p.rank_3v3 ?? p.rank_2v2}
            </div>
          )}
          {(p.mmr_3v3 ?? p.mmr_2v2) != null && (
            <div className="mt-2 text-xs sm:text-sm font-bold text-primary">
              {p.mmr_3v3 ?? p.mmr_2v2} <span className="text-[9px] text-muted-foreground">MMR</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
