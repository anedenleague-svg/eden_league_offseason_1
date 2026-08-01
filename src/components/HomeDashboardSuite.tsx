import { useMemo } from "react";
import { useLeague, type FixtureEntry } from "@/state/league";
import { useNavigation } from "@/state/navigation";
import { Button } from "@/components/ui/button";
import { TeamBadge } from "@/components/TeamBadge";
import { getTeamColors } from "@/lib/team-branding";
import {
  Calendar,
  MessageSquare,
  Handshake,
  Trophy,
  AlertCircle,
  Sparkles,
  CheckCircle,
  FileText,
} from "lucide-react";

export function HomeDashboardSuite() {
  const { state, selectedUser, standings } = useLeague();
  const { goToSuite } = useNavigation();

  const userTeam = selectedUser;
  const team = state.teams[userTeam];
  const manager = state.managers[userTeam];

  // 1. Standings placement
  const rank = useMemo(() => {
    const idx = standings.findIndex((s) => s.name === userTeam);
    return idx >= 0 ? idx + 1 : null;
  }, [standings, userTeam]);

  const standingRow = useMemo(() => {
    return standings.find((s) => s.name === userTeam);
  }, [standings, userTeam]);

  // 2. Upcoming Match
  const upcomingMatch = useMemo(() => {
    const activeWeek = state.currentWeek;
    // Find fixtures for userTeam in current week that are not played
    const matches = state.fixtures.filter(
      (f) => f.week === activeWeek && (f.home === userTeam || f.away === userTeam),
    );
    // Find the one closest to current day or unplayed
    const played = state.results;
    const unplayed = matches.filter((f) => !played[f.id]);
    return unplayed[0] || matches[matches.length - 1] || null;
  }, [state.fixtures, state.results, userTeam, state.currentWeek]);

  // 3. Trade/Negotiation proposals
  const activeProposals = useMemo(() => {
    return state.tradeProposals.filter((p) => p.teamA === userTeam || p.teamB === userTeam);
  }, [state.tradeProposals, userTeam]);

  // 4. Draft notification
  const draftTurnInfo = useMemo(() => {
    if (!state.draft || state.draft.complete) return null;
    const currentPick = state.draft.order[state.draft.currentPickIndex];
    if (!currentPick) return null;

    // Find if the current pick belongs to userTeam
    // Pick structure contains pick.team usually, let's verify in state/league.tsx if needed
    // In DraftSuite.tsx, a pick is drawn from draft.order, and we check state.draft.order
    const activePickId = state.draft.order[state.draft.currentPickIndex];
    const pickDetail = state.draftPicks?.find((p) => p.id === activePickId);
    const isUserTurn = pickDetail?.team === userTeam;

    return {
      isUserTurn,
      round: pickDetail?.round || 1,
      number: pickDetail?.number || 1,
      overall: state.draft.currentPickIndex + 1,
    };
  }, [state.draft, state.draftPicks, userTeam]);

  // 5. Tasks/Reminders
  const tasks = useMemo(() => {
    const list = [];

    // Draft turn
    if (draftTurnInfo?.isUserTurn) {
      list.push({
        id: "draft-turn",
        title: "Your Draft Selection Is Up!",
        description: `You are currently on the clock for Round ${draftTurnInfo.round}, Pick ${draftTurnInfo.number} (Overall ${draftTurnInfo.overall}).`,
        actionLabel: "Go to Draft Room",
        action: () => goToSuite("Draft"),
        severity: "critical",
      });
    }

    // Unresolved trade proposals
    if (activeProposals.length > 0) {
      list.push({
        id: "trades",
        title: "Pending Trade Proposals",
        description: `You have ${activeProposals.length} active trade proposal(s) awaiting your feedback in the Negotiation Suite.`,
        actionLabel: "Open Negotiations",
        action: () => goToSuite("Negotiation"),
        severity: "high",
      });
    }

    // Team needs starters check
    const hasIncompleteLineup = team ? team.lineup.some((p) => !p) : false;
    if (hasIncompleteLineup) {
      list.push({
        id: "lineup",
        title: "Incomplete Lineup",
        description:
          "Your matchday squad has empty starting positions. Fill them in the Team Editor before the next match.",
        actionLabel: "Fix Lineup",
        action: () => goToSuite("Team Editor"),
        severity: "high",
      });
    }

    // Injuries/Suspensions check
    const unavailableCount = team
      ? team.players.filter((p) => p.injuryWeeks > 0 || p.suspensionWeeks > 0).length
      : 0;
    if (unavailableCount > 0) {
      list.push({
        id: "injuries",
        title: "Injured or Suspended Players",
        description: `You currently have ${unavailableCount} player(s) ruled out of matchday selection.`,
        actionLabel: "Review Roster",
        action: () => goToSuite("Team Editor"),
        severity: "medium",
      });
    }

    // Standard reminder if clean
    if (list.length === 0) {
      list.push({
        id: "all-clear",
        title: "Roster and Affairs in Order",
        description:
          "No immediate action required. You are fully prepared for the upcoming matchday.",
        actionLabel: "View Standings",
        action: () => goToSuite("League Standings"),
        severity: "low",
      });
    }

    return list;
  }, [draftTurnInfo, activeProposals, team, goToSuite]);

  if (!team) {
    return (
      <div className="py-20 text-center text-muted-foreground">Loading team dashboard state...</div>
    );
  }

  const { primary } = getTeamColors(userTeam);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-8"
        style={{ borderLeft: `6px solid ${primary}` }}
      >
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <TeamBadge teamName={userTeam} className="h-12 w-12" />
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">{userTeam}</h2>
                <p className="text-xs text-muted-foreground">
                  Manager:{" "}
                  <span className="font-semibold text-foreground">{manager?.name || "You"}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="rounded-lg bg-secondary/50 px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                Standings
              </span>
              <span className="text-base font-extrabold text-highlight-blue">
                {rank ? `#${rank} in League` : "Unranked"}
              </span>
            </div>
            <div className="rounded-lg bg-secondary/50 px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                Record
              </span>
              <span className="text-base font-extrabold">
                {standingRow
                  ? `${standingRow.won}W - ${standingRow.drawn}D - ${standingRow.lost}L`
                  : "0-0-0"}
              </span>
            </div>
            <div className="rounded-lg bg-secondary/50 px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                Reputation
              </span>
              <span className="text-base font-extrabold text-highlight-red">
                {manager?.respect ? `${manager.respect}/100` : "50/100"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Tasks and notifications */}
        <div className="space-y-6 md:col-span-2">
          <div className="rounded-xl border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-highlight-blue" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Dashboard &amp; Tasks
                </h3>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {tasks.length} active
              </span>
            </header>
            <div className="divide-y">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5">
                      {task.severity === "critical" && (
                        <AlertCircle className="h-5 w-5 text-destructive animate-pulse" />
                      )}
                      {task.severity === "high" && (
                        <AlertCircle className="h-5 w-5 text-highlight-red" />
                      )}
                      {task.severity === "medium" && (
                        <AlertCircle className="h-5 w-5 text-highlight-blue" />
                      )}
                      {task.severity === "low" && <CheckCircle className="h-5 w-5 text-primary" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">{task.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={
                      task.severity === "critical" || task.severity === "high"
                        ? "default"
                        : "outline"
                    }
                    onClick={task.action}
                    className="self-start sm:self-center font-bold text-xs"
                  >
                    {task.actionLabel}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Team Insights */}
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Quick Team Roster Insights
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-panel p-3 border">
                <span className="text-xs font-semibold text-muted-foreground">
                  Top Rated Players
                </span>
                <div className="mt-2 space-y-1">
                  {[...team.players]
                    .sort((a, b) => b.rating - a.rating)
                    .slice(0, 3)
                    .map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {p.name} ({p.position})
                        </span>
                        <span className="font-extrabold text-highlight-blue">{p.rating}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div className="rounded-lg bg-panel p-3 border">
                <span className="text-xs font-semibold text-muted-foreground">
                  Goalscorers in League
                </span>
                <div className="mt-2 space-y-1">
                  {[...team.players]
                    .filter((p) => (p.goals ?? 0) > 0)
                    .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
                    .slice(0, 3)
                    .map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{p.name}</span>
                        <span className="font-extrabold text-primary">{p.goals} goals</span>
                      </div>
                    ))}
                  {[...team.players].filter((p) => (p.goals ?? 0) > 0).length === 0 && (
                    <div className="text-xs text-muted-foreground italic py-1">
                      No goals scored yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Upcoming match and Quick navigation shortcuts */}
        <div className="space-y-6">
          {/* Upcoming Match Card */}
          <div className="rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <Calendar className="h-4 w-4 text-highlight-red" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Upcoming Match</h3>
            </header>
            <div className="p-5 text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                Week {state.currentWeek} · {state.currentDay}
              </p>

              {upcomingMatch ? (
                <div className="my-4 flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-1 w-24">
                    <TeamBadge teamName={upcomingMatch.home} className="h-10 w-10" />
                    <span className="text-xs font-bold truncate max-w-full text-center">
                      {upcomingMatch.home === userTeam ? "YOU (Home)" : upcomingMatch.home}
                    </span>
                  </div>
                  <span className="text-lg font-black text-muted-foreground px-2">VS</span>
                  <div className="flex flex-col items-center gap-1 w-24">
                    <TeamBadge teamName={upcomingMatch.away} className="h-10 w-10" />
                    <span className="text-xs font-bold truncate max-w-full text-center">
                      {upcomingMatch.away === userTeam ? "YOU (Away)" : upcomingMatch.away}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-4 text-xs text-muted-foreground italic">
                  No fixture found for this day
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                Day advancement and sim controls are located in the League Commissioner page. Notify
                your commissioner when you are ready to play!
              </p>

              <Button
                size="sm"
                variant="outline"
                onClick={() => goToSuite("League Standings")}
                className="mt-4 w-full font-bold text-xs"
              >
                Inspect Schedule &amp; Standings
              </Button>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Office Shortcuts
            </h3>
            <div className="grid gap-2">
              <button
                onClick={() => goToSuite("Messages")}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/70 transition-colors border text-left"
              >
                <MessageSquare className="h-4 w-4 text-highlight-blue" />
                <div className="text-xs font-bold">Chat Room / Inbox</div>
              </button>
              <button
                onClick={() => goToSuite("Negotiation")}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/70 transition-colors border text-left"
              >
                <Handshake className="h-4 w-4 text-highlight-red" />
                <div className="text-xs font-bold">Active Negotiations</div>
              </button>
              <button
                onClick={() => goToSuite("Contracts")}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/70 transition-colors border text-left"
              >
                <FileText className="h-4 w-4 text-primary" />
                <div className="text-xs font-bold">Manage Squad Contracts</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
