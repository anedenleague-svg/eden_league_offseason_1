import { useMemo } from "react";
import { useLeague } from "@/state/league";
import { TeamBadge } from "@/components/TeamBadge";
import { payrollOf, calculateMarketValue } from "@/lib/contracts";

// Season Analysis Suite — shows a read-only summary of the just-finished
// season from the imported league data. This gives the user context before
// starting offseason activities (draft, trades, contracts).

export function SeasonAnalysisSuite() {
  const { state, standings, leaderboards } = useLeague();

  const champion = state.playoffs?.champion;
  const mvp = state.playoffs?.mvp;

  const seasonSummary = useMemo(() => {
    const summaries = state.seasonSummaries ?? [];
    return summaries.find((s) => s.season === state.season);
  }, [state.seasonSummaries, state.season]);

  const runnerUp = seasonSummary?.runnerUp;

  const teamPayrolls = useMemo(() => {
    return state.teamOrder
      .map((name) => ({
        name,
        payroll: payrollOf(state.teams[name]),
        rosterSize: state.teams[name]?.players.length ?? 0,
        avgRating:
          state.teams[name]?.players.reduce((s, p) => s + p.rating, 0) /
            (state.teams[name]?.players.length ?? 1) ?? 0,
        morale: state.teams[name]?.morale ?? 50,
      }))
      .sort((a, b) => b.payroll - a.payroll);
  }, [state.teams, state.teamOrder]);

  const expiringContracts = useMemo(() => {
    const expiring: {
      team: string;
      player: string;
      position: string;
      rating: number;
      salary: number;
    }[] = [];
    for (const name of state.teamOrder) {
      const team = state.teams[name];
      if (!team) continue;
      for (const p of team.players) {
        if ((p.contractYears ?? 0) === 0) {
          expiring.push({
            team: name,
            player: p.name,
            position: p.position,
            rating: p.rating,
            salary: p.salary ?? 0,
          });
        }
      }
    }
    return expiring.sort((a, b) => b.rating - a.rating);
  }, [state.teams, state.teamOrder]);

  const oldestPlayers = useMemo(() => {
    const all: { team: string; name: string; age: number; rating: number; position: string }[] = [];
    for (const name of state.teamOrder) {
      const team = state.teams[name];
      if (!team) continue;
      for (const p of team.players) {
        all.push({
          team: name,
          name: p.name,
          age: p.age ?? 25,
          rating: p.rating,
          position: p.position,
        });
      }
    }
    return all.sort((a, b) => b.age - a.age).slice(0, 15);
  }, [state.teams, state.teamOrder]);

  const topProspects = useMemo(() => {
    const all: { team: string; name: string; age: number; rating: number; position: string }[] = [];
    for (const name of state.teamOrder) {
      const team = state.teams[name];
      if (!team) continue;
      for (const p of team.players) {
        if ((p.age ?? 25) <= 23) {
          all.push({
            team: name,
            name: p.name,
            age: p.age ?? 25,
            rating: p.rating,
            position: p.position,
          });
        }
      }
    }
    return all.sort((a, b) => b.rating - a.rating).slice(0, 15);
  }, [state.teams, state.teamOrder]);

  const freeAgentCount = state.freeAgents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Season Header */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Season {state.season} · Completed
            </div>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
              Offseason Analysis
            </h2>
          </div>
          <div className="flex items-center gap-6">
            {champion && (
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  Champion
                </div>
                <div className="mt-1 flex items-center gap-2 text-lg font-bold">
                  <TeamBadge team={champion} size={20} />
                  {champion}
                </div>
              </div>
            )}
            {mvp && (
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                  Season MVP
                </div>
                <div className="mt-1 text-lg font-bold">{mvp.name}</div>
                <div className="text-xs text-muted-foreground">{mvp.team}</div>
              </div>
            )}
          </div>
        </div>

        {seasonSummary?.summary && (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {seasonSummary.summary}
          </p>
        )}
      </div>

      {/* Final Standings */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
          Final Standings
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left font-bold uppercase text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-center">PLD</th>
                <th className="px-3 py-2 text-center">W</th>
                <th className="px-3 py-2 text-center">D</th>
                <th className="px-3 py-2 text-center">L</th>
                <th className="px-3 py-2 text-center">GF</th>
                <th className="px-3 py-2 text-center">GA</th>
                <th className="px-3 py-2 text-center">GD</th>
                <th className="px-3 py-2 text-center">PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr
                  key={row.team}
                  className={`border-b last:border-0 ${
                    row.team === champion
                      ? "bg-amber-500/10"
                      : row.team === runnerUp
                        ? "bg-muted/40"
                        : "odd:bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-1.5 text-center font-mono tabular-nums">{row.rank}</td>
                  <td className="px-3 py-1.5 font-medium">
                    <div className="flex items-center gap-2">
                      <TeamBadge team={row.team} size={16} />
                      {row.team}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.pld}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.w}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.d}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.l}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.gf}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{row.ga}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono font-bold tabular-nums text-primary">
                    {row.pts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Award Leaders */}
      <div className="grid gap-4 md:grid-cols-3">
        <AwardCard
          title="Golden Boot"
          rows={leaderboards.scorers.slice(0, 5).map((s) => ({
            primary: s.name,
            secondary: s.team,
            value: `${s.goals} goals`,
          }))}
        />
        <AwardCard
          title="Assist Leaders"
          rows={leaderboards.assists.slice(0, 5).map((a) => ({
            primary: a.name,
            secondary: a.team,
            value: `${a.assists} assists`,
          }))}
        />
        <AwardCard
          title="Golden Glove"
          rows={leaderboards.keepers.slice(0, 5).map((k) => ({
            primary: k.name,
            secondary: k.team,
            value: `${k.cleanSheets} CS · ${k.conceded} GA`,
          }))}
        />
      </div>

      {/* Team Payrolls & Roster Health */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
          Team Payrolls & Roster Health
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left font-bold uppercase text-muted-foreground">
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-center">Roster</th>
                <th className="px-3 py-2 text-center">Avg OVR</th>
                <th className="px-3 py-2 text-center">Payroll ($M)</th>
                <th className="px-3 py-2 text-center">Cap Space ($M)</th>
                <th className="px-3 py-2 text-center">Morale</th>
              </tr>
            </thead>
            <tbody>
              {teamPayrolls.map((t) => (
                <tr key={t.name} className="border-b last:border-0 odd:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium">
                    <div className="flex items-center gap-2">
                      <TeamBadge team={t.name} size={16} />
                      {t.name}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{t.rosterSize}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{t.avgRating.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">${t.payroll.toFixed(1)}M</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">
                    ${Math.max(0, state.salaryCap - t.payroll).toFixed(1)}M
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        t.morale >= 65
                          ? "bg-green-500/20 text-green-600"
                          : t.morale >= 40
                            ? "bg-yellow-500/20 text-yellow-600"
                            : "bg-red-500/20 text-red-600"
                      }`}
                    >
                      {Math.round(t.morale)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expiring Contracts */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wide">Expiring Contracts</span>
          <span className="text-xs text-muted-foreground">
            {expiringContracts.length} players need new deals
          </span>
        </div>
        {expiringContracts.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No expiring contracts — all rosters are locked in.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-left font-bold uppercase text-muted-foreground">
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2 text-center">Pos</th>
                  <th className="px-3 py-2 text-center">OVR</th>
                  <th className="px-3 py-2 text-center">Salary</th>
                  <th className="px-3 py-2 text-center">Market Value</th>
                </tr>
              </thead>
              <tbody>
                {expiringContracts.slice(0, 30).map((p) => (
                  <tr key={`${p.team}-${p.player}`} className="border-b last:border-0 odd:bg-muted/20">
                    <td className="px-3 py-1.5 font-medium">{p.player}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <TeamBadge team={p.team} size={16} />
                        {p.team}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-center">{p.position}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{p.rating.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">${p.salary.toFixed(1)}M</td>
                    <td className="px-3 py-1.5 text-center tabular-nums font-semibold">
                      ${calculateMarketValue(p.rating).toFixed(1)}M
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aging Roster & Young Talent */}
      <div className="grid gap-4 md:grid-cols-2">
        <PlayerListCard
          title="Oldest Players (Retirement Candidates)"
          players={oldestPlayers}
          valueKey="age"
          valueLabel="Age"
        />
        <PlayerListCard
          title="Top Young Talent (U23)"
          players={topProspects}
          valueKey="rating"
          valueLabel="OVR"
        />
      </div>

      {/* Free Agents */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wide">Free Agent Pool</span>
          <span className="text-xs text-muted-foreground">{freeAgentCount} available players</span>
        </div>
      </div>
    </div>
  );
}

function AwardCard({
  title,
  rows,
}: {
  title: string;
  rows: { primary: string; secondary: string; value: string }[];
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-2.5 text-sm font-bold uppercase tracking-wide">{title}</div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-center text-xs text-muted-foreground">No data</div>
      ) : (
        <ul className="divide-y">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-xs">
              <div>
                <div className="font-semibold">{r.primary}</div>
                <div className="text-muted-foreground">{r.secondary}</div>
              </div>
              <div className="font-bold tabular-nums text-primary">{r.value}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerListCard({
  title,
  players,
  valueKey,
  valueLabel,
}: {
  title: string;
  players: { team: string; name: string; age: number; rating: number; position: string }[];
  valueKey: "age" | "rating";
  valueLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-2.5 text-sm font-bold uppercase tracking-wide">{title}</div>
      {players.length === 0 ? (
        <div className="px-4 py-4 text-center text-xs text-muted-foreground">No data</div>
      ) : (
        <ul className="divide-y">
          {players.map((p, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                <TeamBadge team={p.team} size={16} />
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-muted-foreground">
                    {p.position} · {p.team}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">
                  {valueKey === "age" ? p.age : p.rating.toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground">{valueLabel}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
