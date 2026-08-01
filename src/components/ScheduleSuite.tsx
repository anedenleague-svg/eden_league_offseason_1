import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLeague,
  isManualOnly,
  isWeekComplete,
  type FixtureEntry,
  type DayOfWeek,
  ALL_DAYS,
  type PlayoffMatch,
  PLAYOFF_ROUND_NAMES,
  matchWinner,
  type MatchPayload,
} from "@/state/league";
import { SimulationTerminal } from "@/components/SimulationTerminal";
import { MatchCommentaryDialog } from "@/components/MatchCommentaryDialog";
import { TeamBadge } from "@/components/TeamBadge";
import { downloadWeekExport } from "@/lib/league-export";
import { getTeamColors } from "@/lib/team-branding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Day order for display
const DAY_ORDER: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function ScheduleSuite() {
  const {
    state,
    setResult,
    generatePlayoffs,
    setPlayoffResult,
    setPlayoffMvp,
    advanceDay,
    isDayComplete,
    isCurrentWeekComplete,
  } = useLeague();
  const [simFixture, setSimFixture] = useState<any | null>(null);
  const [manualFixture, setManualFixture] = useState<any | null>(null);
  const [commentaryFixture, setCommentaryFixture] = useState<any | null>(null);
  const activeWeekRef = useRef<HTMLElement>(null);

  // Playoff state
  const [simMatch, setSimMatch] = useState<PlayoffMatch | null>(null);
  const [manualMatch, setManualMatch] = useState<PlayoffMatch | null>(null);
  const [commentaryMatch, setCommentaryMatch] = useState<PlayoffMatch | null>(null);

  const weeks = useMemo(() => {
    const map = new Map<number, Map<DayOfWeek, any[]>>();
    for (const f of state.fixtures) {
      if (!map.has(f.week)) map.set(f.week, new Map());
      const dayMap = map.get(f.week)!;
      const day = f.day ?? "Monday";
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push({ ...f, isPlayoff: false });
    }
    if (state.playoffs) {
      state.playoffs.rounds.forEach((round, roundIdx) => {
        const playoffWeek = 17 + roundIdx;
        if (!map.has(playoffWeek)) map.set(playoffWeek, new Map());
        const dayMap = map.get(playoffWeek)!;
        for (const m of round) {
          const day = m.day ?? "Saturday";
          if (!dayMap.has(day)) dayMap.set(day, []);
          dayMap.get(day)!.push({ ...m, isPlayoff: true });
        }
      });
    }
    // Sort weeks and show ALL days (even those with 0 games)
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, dayMap]) => ({
        week,
        days: DAY_ORDER.map((day) => ({ day, fixtures: dayMap.get(day) ?? [] })),
      }));
  }, [state.fixtures, state.playoffs]);

  // On open, jump straight to the current week instead of starting at Week 1.
  useEffect(() => {
    const el = activeWeekRef.current;
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
    // Run once after the schedule first paints for the active week.
  }, [state.currentWeek, weeks.length]);

  const week12Done = isWeekComplete(state, 12);
  const finalFourExists = state.fixtures.some((f) => f.week >= 13);
  const week16Done = isWeekComplete(state, 16);
  const preSeason = state.fixtures.length === 0;
  const dayComplete = isDayComplete();
  const weekComplete = isCurrentWeekComplete();

  return (
    <div>
      {state.playoffs?.champion && (
        <div className="mb-6">
          <MvpSelectionSection />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Season <span className="font-semibold text-foreground">{state.season}</span>
            {" · "}Week <span className="font-semibold text-foreground">{state.currentWeek}</span>
            {" · "}
            <span className="font-semibold text-foreground">{state.currentDay}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {preSeason
              ? "Pre-season — schedule Weeks 1–12 in the Match Scheduling suite"
              : state.currentWeek <= 12
                ? `${12 - state.currentWeek + 1} regular weeks + Final Four remaining`
                : state.currentWeek <= 16
                  ? "Final Four phase"
                  : "Playoffs phase"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <p className="text-xs text-muted-foreground">
            Mistake? Use <span className="font-semibold text-foreground">UNDO</span> in header.
          </p>
        </div>
      </div>

      {preSeason && (
        <div className="mb-6 rounded-xl border bg-panel/50 p-6 text-center text-sm text-muted-foreground">
          No fixtures yet. Open the <strong className="text-foreground">Match Scheduling</strong>{" "}
          suite to run the draft / Team Editor changes and lay down a fresh Weeks 1–12 schedule.
        </div>
      )}

      <div className="space-y-6">
        {weeks.map(({ week, days }) => {
          const isActive = week === state.currentWeek;
          const isFinalFour = week >= 13;
          const allFixtures = days.flatMap((d) => d.fixtures);
          const weekAllPlayed =
            allFixtures.length > 0 &&
            allFixtures.every((f) => (f.isPlayoff ? f.result : state.results[f.id]));
          return (
            <section
              key={week}
              ref={isActive ? activeWeekRef : undefined}
              className="rounded-xl border bg-card scroll-mt-44"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <h3 className="text-sm font-bold uppercase tracking-wide">
                  {week >= 17
                    ? PLAYOFF_ROUND_NAMES[week - 16]
                    : isFinalFour
                      ? `Final Four · Week ${week}`
                      : `Week ${week}`}
                </h3>
                <div className="flex items-center gap-2">
                  {weekAllPlayed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] font-semibold text-primary"
                      onClick={() => downloadWeekExport(state, week)}
                      title="Download this week's results, commentary and Team Editor data as JSON"
                    >
                      ⬇ EXPORT FINISHED WEEK DATA
                    </Button>
                  )}
                  {isActive && (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                      Active
                    </span>
                  )}
                </div>
              </header>
              <div className="divide-y">
                {days.map(({ day, fixtures }) => {
                  const gameCount = fixtures.length;
                  const isCurrentDay = isActive && day === state.currentDay;
                  const dayHasUnplayed = fixtures.some((f) =>
                    f.isPlayoff ? !f.result : !state.results[f.id],
                  );
                  return (
                    <div key={day} className={isCurrentDay ? "bg-primary/5" : ""}>
                      <div className="flex items-center gap-2 bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>{day}</span>
                        <span className="rounded bg-muted-foreground/10 px-1.5 py-0.5 font-mono">
                          {gameCount} {gameCount === 1 ? "game" : "games"}
                        </span>
                        {isCurrentDay && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">
                            Today
                          </span>
                        )}
                        {isCurrentDay && dayHasUnplayed && (
                          <span className="ml-2 text-[10px] font-medium text-primary">
                            Play to advance
                          </span>
                        )}
                        {isCurrentDay && (
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={dayHasUnplayed ? "outline" : "default"}
                              onClick={(e) => {
                                e.stopPropagation();
                                advanceDay();
                              }}
                              className="h-7 px-3 text-[10px] font-bold uppercase tracking-wide"
                            >
                              ADVANCE DAY →
                            </Button>
                          </div>
                        )}
                      </div>
                      {fixtures.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-muted-foreground italic">
                          No matches scheduled
                        </div>
                      ) : (
                        <ul className="divide-y border-l-2 border-l-muted">
                          {fixtures.map((fx) => {
                            const r = fx.isPlayoff ? fx.result : state.results[fx.id];
                            const manualOnly = isManualOnly(fx.home, fx.away);
                            const homeColors = getTeamColors(
                              state.teams[fx.home] ?? { name: fx.home },
                            );
                            const awayColors = getTeamColors(
                              state.teams[fx.away] ?? { name: fx.away },
                            );
                            const homePrimary = homeColors.primary ?? "hsl(var(--border))";
                            const awayPrimary = awayColors.primary ?? "hsl(var(--border))";
                            // Allow play on the current day
                            const canPlay = isCurrentDay;
                            return (
                              <li
                                key={fx.id}
                                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-sm"
                              >
                                <span
                                  className="flex items-center justify-end gap-2 truncate rounded-l-lg py-1 pl-1 pr-3 font-medium"
                                  style={{
                                    backgroundColor: `color-mix(in oklab, ${homePrimary} 15%, transparent)`,
                                    borderLeft: `3px solid ${homePrimary}`,
                                  }}
                                >
                                  {fx.isPlayoff && fx.homeSeed !== undefined && (
                                    <span className="font-mono text-[10px] text-muted-foreground mr-1">
                                      #{fx.homeSeed}
                                    </span>
                                  )}
                                  <span className="truncate">{fx.home}</span>
                                  <TeamBadge team={fx.home} size={20} />
                                </span>
                                <span className="min-w-[64px] text-center font-mono font-bold tabular-nums">
                                  {r ? `${r.homeGoals} - ${r.awayGoals}` : "vs"}
                                </span>
                                <span
                                  className="flex items-center gap-2 truncate rounded-r-lg py-1 pl-3 pr-1 font-medium"
                                  style={{
                                    backgroundColor: `color-mix(in oklab, ${awayPrimary} 15%, transparent)`,
                                    borderRight: `3px solid ${awayPrimary}`,
                                  }}
                                >
                                  <TeamBadge team={fx.away} size={20} />
                                  <span className="truncate">{fx.away}</span>
                                  {fx.isPlayoff && fx.awaySeed !== undefined && (
                                    <span className="font-mono text-[10px] text-muted-foreground ml-1">
                                      #{fx.awaySeed}
                                    </span>
                                  )}
                                </span>

                                {canPlay && !r && (
                                  <div className="col-span-3 mt-1 flex flex-wrap justify-center gap-2">
                                    {!manualOnly && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setSimFixture(fx)}
                                      >
                                        SIMULATE
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setManualFixture(fx)}
                                    >
                                      ENTER MATCH RESULT
                                    </Button>
                                    {manualOnly && (
                                      <span className="self-center text-[10px] uppercase text-muted-foreground">
                                        Manual entry only
                                      </span>
                                    )}
                                  </div>
                                )}
                                {r && (
                                  <div className="col-span-3 mt-0.5 flex flex-wrap items-center justify-center gap-3">
                                    <span className="text-[10px] uppercase text-muted-foreground">
                                      {r.method === "SIM" ? "Simulated" : "Manual entry"}
                                    </span>
                                    {r.method === "SIM" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-[11px] font-semibold text-primary"
                                        onClick={() => setCommentaryFixture(fx)}
                                      >
                                        VIEW MATCH COMMENTARY
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!preSeason && state.currentWeek === 12 && !week12Done && (
          <p className="text-center text-xs text-muted-foreground">
            Final Four (Weeks 13–16) unlock once Week 12 is fully recorded.
          </p>
        )}
        {week12Done && !finalFourExists && (
          <p className="text-center text-xs font-semibold text-primary">
            Week 12 complete — open the Match Scheduling suite to build the Final Four.
          </p>
        )}
        {week16Done && (
          <p className="text-center text-xs font-semibold text-primary">
            Regular season complete — playoffs will be shown below.
          </p>
        )}
      </div>

      {/* Playoffs Section */}
      {week16Done && (
        <PlayoffsSection
          simMatch={simFixture}
          setSimMatch={setSimFixture}
          manualMatch={manualFixture}
          setManualMatch={setManualFixture}
          commentaryMatch={commentaryFixture}
          setCommentaryMatch={setCommentaryFixture}
          setPlayoffResult={setPlayoffResult}
          generatePlayoffs={generatePlayoffs}
        />
      )}

      {/* Full-screen simulator overlay */}
      {simFixture && (
        <SimulationTerminal
          initialHome={simFixture.home}
          initialAway={simFixture.away}
          lockTeams
          defaultTempoIndex={1}
          fullscreen
          playoff={simFixture.isPlayoff}
          onComplete={(h, a, payload) => {
            if (simFixture.isPlayoff) {
              setPlayoffResult(simFixture.id, h, a, "SIM", payload);
            } else {
              setResult(simFixture.id, h, a, "SIM", payload);
            }
            setSimFixture(null);
          }}
          onExit={() => setSimFixture(null)}
        />
      )}

      {/* Manual entry modal */}
      <ManualEntryDialog
        fixture={manualFixture}
        onClose={() => setManualFixture(null)}
        onSave={(h, a) => {
          if (manualFixture) {
            if (manualFixture.isPlayoff) {
              setPlayoffResult(manualFixture.id, h, a, "MANUAL");
            } else {
              setResult(manualFixture.id, h, a, "MANUAL");
            }
          }
          setManualFixture(null);
        }}
      />

      {/* Match commentary viewer */}
      <MatchCommentaryDialog
        open={!!commentaryFixture}
        onClose={() => setCommentaryFixture(null)}
        title={commentaryFixture ? `${commentaryFixture.home} vs ${commentaryFixture.away}` : ""}
        log={commentaryFixture ? state.payloads[commentaryFixture.id]?.log : undefined}
      />
    </div>
  );
}

// Playoffs section - shown after Week 16 is complete
function PlayoffsSection({
  simMatch,
  setSimMatch,
  manualMatch,
  setManualMatch,
  commentaryMatch,
  setCommentaryMatch,
  setPlayoffResult,
  generatePlayoffs,
}: {
  simMatch: PlayoffMatch | null;
  setSimMatch: (m: PlayoffMatch | null) => void;
  manualMatch: PlayoffMatch | null;
  setManualMatch: (m: PlayoffMatch | null) => void;
  commentaryMatch: PlayoffMatch | null;
  setCommentaryMatch: (m: PlayoffMatch | null) => void;
  setPlayoffResult: (
    id: string,
    h: number,
    a: number,
    method: "SIM" | "MANUAL",
    payload?: MatchPayload,
  ) => void;
  generatePlayoffs: () => void;
}) {
  const { state } = useLeague();
  const playoffs = state.playoffs;

  if (!playoffs) {
    return (
      <div className="mt-8 rounded-xl border bg-card p-8 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          The regular season and Final Four are complete. Seed the top 14 teams and build the
          bracket (seeds 1 &amp; 2 receive a Round of 14 bye).
        </p>
        <Button onClick={generatePlayoffs} className="px-6 font-semibold">
          GENERATE PLAYOFF BRACKET
        </Button>
      </div>
    );
  }

  // The latest round still needing results is the only one with active controls.
  const activeRoundIdx = playoffs.rounds.findIndex((round) => round.some((m) => !matchWinner(m)));

  return (
    <div className="mt-8 space-y-6">
      {playoffs.champion && (
        <div className="rounded-xl border-2 border-primary bg-accent/40 p-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Season {state.season} Champion
          </div>
          <div className="mt-1 text-2xl font-extrabold text-primary">{playoffs.champion}</div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="border-b px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
          Top 14 Seeds
        </div>
        <ul className="grid grid-cols-2 gap-x-4 p-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {playoffs.seeds.map((team, i) => (
            <li key={team} className="flex items-center gap-2 py-1">
              <span className="w-6 text-center font-mono font-bold text-primary">{i + 1}</span>
              <span className="truncate">{team}</span>
              {i < 2 && (
                <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase text-secondary-foreground">
                  Bye
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        {playoffs.rounds.map((round, idx) => {
          const roundNum = round[0]?.round ?? idx + 1;
          const isActive = idx === activeRoundIdx;
          // Group matches by day within the round
          const fridayMatches = round.filter((m) => m.day === "Friday");
          const saturdayMatches = round.filter((m) => m.day === "Saturday");
          const noDayMatches = round.filter((m) => !m.day);

          return (
            <section key={roundNum} className="rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-4 py-2.5">
                <h3 className="text-sm font-bold uppercase tracking-wide">
                  {PLAYOFF_ROUND_NAMES[roundNum]}
                </h3>
                {isActive && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                    In progress
                  </span>
                )}
              </header>

              {/* Friday matches */}
              {fridayMatches.length > 0 && (
                <div className="border-b">
                  <div className="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Friday{" "}
                    <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-700">
                      Feature Match
                    </span>
                  </div>
                  <ul className="divide-y">
                    {fridayMatches.map((m) => (
                      <PlayoffMatchRow
                        key={m.id}
                        match={m}
                        isActive={isActive}
                        onSim={() => setSimMatch(m)}
                        onManual={() => setManualMatch(m)}
                        onCommentary={() => setCommentaryMatch(m)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Saturday matches */}
              {saturdayMatches.length > 0 && (
                <div className="border-b">
                  <div className="bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Saturday{" "}
                    <span className="ml-2 rounded bg-muted-foreground/10 px-1.5 py-0.5 font-mono">
                      {saturdayMatches.length} {saturdayMatches.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {saturdayMatches.map((m) => (
                      <PlayoffMatchRow
                        key={m.id}
                        match={m}
                        isActive={isActive}
                        onSim={() => setSimMatch(m)}
                        onManual={() => setManualMatch(m)}
                        onCommentary={() => setCommentaryMatch(m)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Matches without day assignment (fallback) */}
              {noDayMatches.length > 0 && (
                <ul className="divide-y">
                  {noDayMatches.map((m) => (
                    <PlayoffMatchRow
                      key={m.id}
                      match={m}
                      isActive={isActive}
                      onSim={() => setSimMatch(m)}
                      onManual={() => setManualMatch(m)}
                      onCommentary={() => setCommentaryMatch(m)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PlayoffMatchRow({
  match,
  isActive,
  onSim,
  onManual,
  onCommentary,
}: {
  match: PlayoffMatch;
  isActive: boolean;
  onSim: () => void;
  onManual: () => void;
  onCommentary: () => void;
}) {
  const winner = matchWinner(match);
  const manualOnly = isManualOnly(match.home, match.away);
  const tie = match.result && !winner;

  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span
          className={`truncate text-right font-medium ${winner === match.home ? "text-primary" : ""}`}
        >
          <span className="mr-1 font-mono text-xs text-muted-foreground">#{match.homeSeed}</span>
          {match.home}
        </span>
        <span className="min-w-[64px] text-center font-mono font-bold tabular-nums">
          {match.result ? `${match.result.homeGoals} - ${match.result.awayGoals}` : "vs"}
        </span>
        <span
          className={`truncate text-left font-medium ${winner === match.away ? "text-primary" : ""}`}
        >
          {match.away}
          <span className="ml-1 font-mono text-xs text-muted-foreground">#{match.awaySeed}</span>
        </span>
      </div>
      {isActive && !match.result && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          {!manualOnly && (
            <Button size="sm" variant="secondary" onClick={onSim}>
              SIMULATE
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onManual}>
            ENTER MATCH RESULT
          </Button>
          {manualOnly && (
            <span className="self-center text-[10px] uppercase text-muted-foreground">
              Manual entry only
            </span>
          )}
        </div>
      )}
      {tie && (
        <p className="mt-1 text-center text-[10px] font-semibold uppercase text-destructive">
          Tie — re-enter a result with a winner to advance
        </p>
      )}
      {match.result?.method === "SIM" && (
        <div className="mt-1 flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] font-semibold text-primary"
            onClick={onCommentary}
          >
            VIEW MATCH COMMENTARY
          </Button>
        </div>
      )}
    </li>
  );
}

function MvpSelectionSection() {
  const { state, setPlayoffMvp } = useLeague();
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  const teamsList = useMemo(() => {
    return state.teamOrder;
  }, [state.teamOrder]);

  const playersList = useMemo(() => {
    if (!selectedTeam) return [];
    return [...(state.teams[selectedTeam]?.players ?? [])].sort((a, b) => b.rating - a.rating);
  }, [state.teams, selectedTeam]);

  // If MVP is already saved on state.playoffs?.mvp:
  if (state.playoffs?.mvp) {
    return (
      <div className="rounded-xl border-2 border-amber-500 bg-amber-500/10 p-6 text-center shadow-md">
        <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-500">
          🏆 Season {state.season} MVP Awarded 🏆
        </div>
        <div className="mt-2 text-2xl font-extrabold text-foreground">
          {state.playoffs.mvp.name}
        </div>
        <div className="mt-1 text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2">
          <TeamBadge team={state.playoffs.mvp.team} size={18} />
          {state.playoffs.mvp.team}
        </div>
      </div>
    );
  }

  const handleSaveMvp = () => {
    if (!selectedTeam || !selectedPlayer) {
      toast.error("Please select a team and player first.");
      return;
    }
    const playerObj = state.teams[selectedTeam].players.find((p) => p.name === selectedPlayer);
    if (!playerObj) return;

    setPlayoffMvp({
      team: selectedTeam,
      name: selectedPlayer,
      goals: 0,
    });
    toast.success(`${selectedPlayer} has been awarded the Season ${state.season} MVP!`);
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-500 bg-card p-6 shadow-sm space-y-4">
      <div className="text-center">
        <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-500">
          🏆 Manual Award: Season MVP 🏆
        </div>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          The playoff final has concluded and a champion is crowned! Please manually award the
          Season MVP to unlock the offseason Draft.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-center gap-4">
        <div className="space-y-1.5 w-60">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Select Team
          </label>
          <Select
            value={selectedTeam}
            onValueChange={(val) => {
              setSelectedTeam(val);
              setSelectedPlayer("");
            }}
          >
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Choose team..." />
            </SelectTrigger>
            <SelectContent>
              {teamsList.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-60">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Select Player
          </label>
          <Select value={selectedPlayer} onValueChange={setSelectedPlayer} disabled={!selectedTeam}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder={selectedTeam ? "Choose player..." : "Select team first"} />
            </SelectTrigger>
            <SelectContent>
              {playersList.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name} ({p.position} · OVR {p.rating.toFixed(1)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSaveMvp}
          disabled={!selectedTeam || !selectedPlayer}
          className="font-bold bg-amber-500 hover:bg-amber-500/90 text-black px-6"
        >
          CONFIRM MVP
        </Button>
      </div>
    </div>
  );
}

function ManualEntryDialog({
  fixture,
  onClose,
  onSave,
}: {
  fixture: any | null;
  onClose: () => void;
  onSave: (h: number, a: number) => void;
}) {
  const [h, setH] = useState("0");
  const [a, setA] = useState("0");
  // Reset the score inputs whenever a different fixture is opened, so stale
  // scores from a previous entry never carry over.
  useEffect(() => {
    setH("0");
    setA("0");
  }, [fixture?.id]);
  const isPlayoff = fixture?.isPlayoff;
  const tie = isPlayoff && (parseInt(h) || 0) === (parseInt(a) || 0);
  return (
    <Dialog open={!!fixture} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Enter Match Result</DialogTitle>
        </DialogHeader>
        {fixture && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <div className="mb-1 truncate text-xs font-semibold">{fixture.home}</div>
              <Input
                type="number"
                min={0}
                value={h}
                onChange={(e) => setH(e.target.value)}
                className="text-center"
              />
            </div>
            <span className="pb-2 font-bold text-muted-foreground">-</span>
            <div>
              <div className="mb-1 truncate text-xs font-semibold">{fixture.away}</div>
              <Input
                type="number"
                min={0}
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="text-center"
              />
            </div>
          </div>
        )}
        {tie && (
          <p className="text-center text-xs text-destructive">
            Playoff games cannot end level — one team must win.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={tie}
            onClick={() => onSave(Math.max(0, parseInt(h) || 0), Math.max(0, parseInt(a) || 0))}
          >
            Log Result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
