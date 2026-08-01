// Offseason export — produces a JSON file the main Eden League app can import
// to skip its built-in offseason and jump straight to the next season.
//
// The export contains the full LeagueState (minus undo/redo stacks) after all
// offseason activities (aging, draft, trades, contracts, free agency) are done.
// The main app's importLeagueExport function already accepts this shape because
// it uses the same "eden-league-full-export" kind and `state` payload.
//
// The offseason app also applies the season transition (age players, increment
// season number, clear results/fixtures) at export time so the imported state
// is ready for a fresh season with no further offseason processing needed.
import type {
  LeagueState,
  LeagueTeam,
  LeaguePlayer,
  StandingRow,
  Leaderboards,
} from "@/state/league";
import {
  buildDefaultLineup,
  syncStarters,
  buildDraftPicks,
} from "@/state/league";
import { ageOnePlayer } from "@/lib/aging";
import { carryOverMorale } from "@/lib/morale";
import { downloadJson } from "@/lib/league-export";
import type { ManagerMessageRow } from "@/lib/league-export";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// Apply offseason aging to one team (mirrors the main app's offseasonTeam).
function offseasonTeam(team: LeagueTeam): LeagueTeam {
  const players: LeaguePlayer[] = [];
  let moraleBump = 0;
  for (const p of team.players) {
    const res = ageOnePlayer({
      ...p,
      injuryWeeks: 0,
      suspensionWeeks: 0,
      reservedSlot: null,
      yellowLog: [],
    });
    if (res.veteranFulfilled) moraleBump += 1;
    players.push(res.player);
  }
  const morale = Math.max(0, Math.min(100, carryOverMorale(team.morale) + moraleBump * 2));
  const lineup = buildDefaultLineup(players, team.formation);
  return syncStarters({ ...team, players, morale, lineup });
}

export interface OffseasonExportOptions {
  // If true, apply the season transition (age players, increment season,
  // clear fixtures/results) before exporting. This is the default — the
  // resulting file is ready to import into the main app as a new season.
  applyTransition: boolean;
}

// Build the offseason export object from the current league state.
export function buildOffseasonExport(
  state: LeagueState,
  standings: StandingRow[],
  leaderboards: Leaderboards,
  messages: ManagerMessageRow[] = [],
  options: OffseasonExportOptions = { applyTransition: true },
) {
  let exportState: LeagueState = state;

  if (options.applyTransition) {
    // Age all squads, increment season, clear season-specific data.
    const teams: Record<string, LeagueTeam> = {};
    for (const name of state.teamOrder) {
      teams[name] = offseasonTeam(state.teams[name]);
    }

    exportState = {
      ...state,
      season: state.season + 1,
      currentWeek: 1,
      currentDay: "Monday",
      teams,
      fixtures: [],
      results: {},
      payloads: {},
      playoffs: undefined,
      tradeProposals: [],
      draftPicks: buildDraftPicks(state.teamOrder, state.season + 1),
      draft: undefined,
    };
  }

  // Strip session-only stacks.
  const { undoStack: _u, redoStack: _r, ...persistable } = exportState;
  void _u;
  void _r;

  return {
    exportedAt: new Date().toISOString(),
    kind: "eden-league-full-export",
    offseasonExport: true,
    offseasonFromSeason: state.season,
    offseasonToSeason: options.applyTransition ? state.season + 1 : state.season,
    state: persistable,
    season: exportState.season,
    currentWeek: exportState.currentWeek,
    messages,
    standings,
    goldenBoot: leaderboards.scorers,
    assistLeaders: leaderboards.assists,
    goldenGlove: leaderboards.keepers,
  };
}

export async function downloadOffseasonExport(
  state: LeagueState,
  standings: StandingRow[],
  leaderboards: Leaderboards,
) {
  // Import the Supabase client lazily to avoid circular deps at module load.
  const { supabase } = await import("@/integrations/supabase/client");
  const { fetchManagerMessages } = await import("@/lib/league-export");
  const messages = await fetchManagerMessages();
  const data = buildOffseasonExport(state, standings, leaderboards, messages);
  downloadJson(
    `eden-league-offseason-S${state.season}-to-S${state.season + 1}-${stamp()}`,
    data,
  );
}

// Partial offseason snapshot — a "save point" taken mid-offseason (after
// importing league data but before the offseason is complete). Restoring it
// resets the offseason state to exactly what it was at export time WITHOUT
// re-applying the season transition. The initial league import is preserved
// because the snapshot contains the full LeagueState at the moment of export.
export function buildPartialOffseasonExport(
  state: LeagueState,
  standings: StandingRow[],
  leaderboards: Leaderboards,
  messages: ManagerMessageRow[] = [],
) {
  // Strip session-only stacks; keep everything else verbatim.
  const { undoStack: _u, redoStack: _r, ...persistable } = state;
  void _u;
  void _r;
  return {
    exportedAt: new Date().toISOString(),
    kind: "eden-league-full-export",
    offseasonExport: true,
    partialOffseason: true,
    offseasonFromSeason: state.season,
    offseasonToSeason: state.season,
    state: persistable,
    season: state.season,
    currentWeek: state.currentWeek,
    messages,
    standings,
    goldenBoot: leaderboards.scorers,
    assistLeaders: leaderboards.assists,
    goldenGlove: leaderboards.keepers,
  };
}

export async function downloadPartialOffseasonExport(
  state: LeagueState,
  standings: StandingRow[],
  leaderboards: Leaderboards,
) {
  const { fetchManagerMessages } = await import("@/lib/league-export");
  const messages = await fetchManagerMessages();
  const data = buildPartialOffseasonExport(state, standings, leaderboards, messages);
  downloadJson(
    `eden-league-partial-offseason-S${state.season}-W${state.currentWeek}-${stamp()}`,
    data,
  );
}
