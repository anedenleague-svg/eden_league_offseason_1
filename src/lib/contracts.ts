// Eden Contracts & Dynamic Salary Cap Engine — faithful TypeScript port of the
// eden_contract_salary_cap_engine.py reference. Adds a second financial layer
// (annual salaries + a league-wide Hard Salary Cap) on top of transfer budgets,
// plus player/club contract negotiation sub-engines and an offseason free-agency
// cycle.
import type { LeaguePlayer, LeagueTeam, LeagueState } from "@/state/league";
import { settings, isContractExempt } from "@/lib/engine-settings";

// Default reference list (the live, editable list lives in engine-settings).
// Use isContractExempt(name) for runtime checks so Settings edits take effect.
export const CONTRACT_EXEMPT_TEAMS = new Set(["Gugu Team", "Spams"]);

const round2 = (n: number) => Math.round(n * 100) / 100;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ---------------- Market valuation (Eden League valuation guidelines) -------
export function calculateMarketValue(rating: number): number {
  const r = rating;
  let val: number;
  if (r < 4.0) val = 1.0 + (r / 4.0) * 2.0;
  else if (r < 6.0) val = 3.0 + ((r - 4.0) / 2.0) * 3.0;
  else if (r < 8.0) val = 6.0 + ((r - 6.0) / 2.0) * 6.0;
  else if (r < 9.0) val = 12.0 + ((r - 8.0) / 1.0) * 6.0;
  else val = 18.0 + ((r - 9.0) / 1.0) * 32.0;
  return round2(Math.max(1.0, Math.min(val, 50.0)));
}

// Total annual payroll for a club (sum of all player salaries).
export function payrollOf(team: LeagueTeam): number {
  return round2(team.players.reduce((s, p) => s + (p.salary ?? 0), 0));
}

// League-wide Hard Salary Cap ($M). Lowered to make the offseason tighter so
// clubs must pick and choose their players. Editable in the Contracts suite.
export const DEFAULT_SALARY_CAP = 140;

// ---------------- First-time compliance initialization ----------------------
// Pays every player exactly their market value, assigns a random 1–4yr deal,
// then applies the global Hard Salary Cap as every club's payroll ceiling.
export function initializeContracts(
  teams: Record<string, LeagueTeam>,
  teamOrder: string[],
): { teams: Record<string, LeagueTeam>; salaryCap: number } {
  const next: Record<string, LeagueTeam> = {};
  for (const name of teamOrder) {
    const t = teams[name];
    const players = t.players.map((p) => ({
      ...p,
      salary: calculateMarketValue(p.rating),
      contractYears: randInt(1, 4),
    }));
    next[name] = { ...t, players };
  }
  const salaryCap = DEFAULT_SALARY_CAP;
  for (const name of teamOrder) {
    next[name] = { ...next[name], salaryBudget: salaryCap };
  }
  return { teams: next, salaryCap };
}

// ---------------- Sub-Engine B: Athlete Ambition (player demands) -----------
export interface ContractDemand {
  salary: number;
  years: number;
}

export function calculatePlayerDemands(p: LeaguePlayer): ContractDemand {
  const marketValue = calculateMarketValue(p.rating);
  const moraleFactor = ((p.morale ?? 50) - 50.0) / 100.0; // -0.5 .. +0.5
  let demandModifier = 1.0 + moraleFactor * -0.15 + (p.rating / 10.0) * 0.1;
  demandModifier = Math.max(
    settings.demandModifierMin,
    Math.min(demandModifier, settings.demandModifierMax),
  );
  const salary = round2(marketValue * demandModifier);
  const years = (p.age ?? 25) >= 31 ? choice([1, 2]) : choice([2, 3, 4]);
  return { salary, years };
}

// ---------------- Sub-Engine A: Club Front Office (club decisions) ----------
export interface ContractAction {
  type: "RESIGNED" | "NEGOTIATED" | "RELEASED" | "FREE_AGENT" | "EMERGENCY_SIGN";
  team: string;
  player: string;
  detail: string;
}

// Cost of a single rookie contract — used to reserve cap space for draft picks.
export const ROOKIE_CONTRACT_COST = 2.0;

// Evaluate one (non-exempt) club's expiring players. Returns the updated roster
// and any players released into free agency. salaryCap doubles as the budget
// ceiling (all clubs share the same hard cap). draftReserve is cap space the
// club must keep free for its upcoming draft picks (each rookie costs
// ROOKIE_CONTRACT_COST); the front office treats (salaryCap - draftReserve) as
// its effective ceiling.
export function evaluateClubContracts(
  team: LeagueTeam,
  salaryCap: number,
  draftReserve = 0,
): { players: LeaguePlayer[]; freed: LeaguePlayer[]; actions: ContractAction[] } {
  const effectiveCap = salaryCap - draftReserve;
  const actions: ContractAction[] = [];
  const freed: LeaguePlayer[] = [];
  let roster = team.players.map((p) => ({ ...p }));

  const expiring = roster
    .filter((p) => (p.contractYears ?? 0) === 0)
    .sort((a, b) => b.rating - a.rating);

  for (const player of expiring) {
    const idx = roster.findIndex((p) => p === player || p.name === player.name);
    if (idx < 0) continue;
    const demand = calculatePlayerDemands(player);

    const committedPayroll = roster
      .filter((p) => (p.contractYears ?? 0) > 0)
      .reduce((s, p) => s + (p.salary ?? 0), 0);
    const projected = round2(committedPayroll + demand.salary);

    if (projected <= effectiveCap) {
      roster[idx] = { ...player, salary: demand.salary, contractYears: demand.years };
      actions.push({
        type: "RESIGNED",
        team: team.name,
        player: player.name,
        detail: `Re-signed to a ${demand.years}yr / $${demand.salary}M deal.`,
      });
    } else if (player.rating < 6.0) {
      freed.push({ ...player, contractYears: 0 });
      roster = roster.filter((_, i) => i !== idx);
      actions.push({
        type: "RELEASED",
        team: team.name,
        player: player.name,
        detail: `Cut low-impact player ($${player.salary ?? 0}M) to save cap space.`,
      });
    } else {
      const paycut = round2(demand.salary * (1 - settings.veteranPaycut));
      const cutPct = Math.round(settings.veteranPaycut * 100);
      const acceptanceChance = 30 + (player.morale ?? 50) * 0.5;
      if (randInt(1, 100) <= acceptanceChance) {
        roster[idx] = { ...player, salary: paycut, contractYears: demand.years };
        actions.push({
          type: "NEGOTIATED",
          team: team.name,
          player: player.name,
          detail: `Accepted a ${cutPct}% paycut ($${paycut}M for ${demand.years}yrs).`,
        });
      } else {
        freed.push({ ...player, contractYears: 0 });
        roster = roster.filter((_, i) => i !== idx);
        actions.push({
          type: "FREE_AGENT",
          team: team.name,
          player: player.name,
          detail: `Rejected the lowball offer and entered Free Agency.`,
        });
      }
    }
  }

  return { players: roster, freed, actions };
}

const MIN_ROSTER = 11;

// ---------------- Offseason contract cycle ----------------------------------
// 1. Decrement all contracts by 1 year.
// 2. Run the front-office engine for every non-exempt club (renew / cut / FA).
// 3. Emergency-fill any club below the 11-player minimum from the FA pool,
//    prioritized by remaining cap space, signing 1yr deals at base market value.
export function runContractCycle(state: LeagueState): {
  teams: Record<string, LeagueTeam>;
  freeAgents: LeaguePlayer[];
  salaryCap: number;
  actions: ContractAction[];
} {
  // Missing cap (corrupt/old state) must NOT read as 0 — that would make every
  // wage demand exceed the cap and purge whole rosters. Treat absent as unlimited.
  const salaryCap = state.salaryCap && state.salaryCap > 0 ? state.salaryCap : Infinity;
  const actions: ContractAction[] = [];
  const teams: Record<string, LeagueTeam> = {};
  let freeAgents: LeaguePlayer[] = [...(state.freeAgents ?? [])];

  // 1. Contract decay.
  for (const name of state.teamOrder) {
    const t = state.teams[name];
    if (!t) continue; // skip a missing/corrupt team entry rather than crashing
    teams[name] = {
      ...t,
      players: t.players.map((p) => ({
        ...p,
        contractYears: Math.max(0, (p.contractYears ?? 0) - 1),
      })),
    };
  }

  // 2. Front-office decisions (non-exempt clubs only).
  for (const name of state.teamOrder) {
    if (isContractExempt(name)) continue;
    if (!teams[name]) continue; // skip a missing/corrupt team entry rather than crashing
    // Reserve cap space for draft picks this club still owns. Each rookie
    // costs ROOKIE_CONTRACT_COST, so the front office must leave that much
    // room under the cap or it won't be able to field its draftees.
    const ownedPicks = (state.draftPicks ?? []).filter((pk) => pk.owner === name).length;
    const draftReserve = ownedPicks * ROOKIE_CONTRACT_COST;
    const { players, freed, actions: a } = evaluateClubContracts(
      teams[name],
      salaryCap,
      draftReserve,
    );
    teams[name] = { ...teams[name], players };
    freeAgents.push(...freed);
    actions.push(...a);
  }

  // 3. Cap compliance pass — GUARANTEE no non-exempt team is over the cap after
  //    the cycle. Each club must also keep draftReserve free for its draft picks.
  //    Release the worst value-for-money players (lowest rating per $M) until
  //    payroll fits under (salaryCap - draftReserve). Never go below MIN_ROSTER.
  for (const name of state.teamOrder) {
    if (isContractExempt(name)) continue;
    if (!teams[name]) continue; // skip a missing/corrupt team entry rather than crashing
    const ownedPicks = (state.draftPicks ?? []).filter((pk) => pk.owner === name).length;
    const draftReserve = ownedPicks * ROOKIE_CONTRACT_COST;
    const effectiveCap = salaryCap - draftReserve;
    let roster = [...teams[name].players];

    while (payrollOf({ ...teams[name], players: roster }) > effectiveCap + 0.001) {
      if (roster.length <= MIN_ROSTER) break; // never gut below minimum
      // Worst value: lowest rating per dollar of salary. Prefer releasing
      // higher-salary players when ratings are close.
      const sorted = [...roster].sort((a, b) => {
        const aVal = a.rating / Math.max(0.1, a.salary ?? 0.1);
        const bVal = b.rating / Math.max(0.1, b.salary ?? 0.1);
        if (Math.abs(aVal - bVal) < 0.01) return (b.salary ?? 0) - (a.salary ?? 0);
        return aVal - bVal;
      });
      const cut = sorted[0];
      if (!cut) break;
      roster = roster.filter((p) => p.name !== cut.name);
      freeAgents = [...freeAgents, { ...cut, contractYears: 0 }];
      if (roster.length < MIN_ROSTER) {
        // Put them back — can't go below minimum even to satisfy cap.
        roster.push(cut);
        break;
      }
      actions.push({
        type: "RELEASED",
        team: name,
        player: cut.name,
        detail: `Released for cap compliance (${cut.salary ?? 0}M).`,
      });
    }
    teams[name] = { ...teams[name], players: roster };
  }

  // 4. Emergency roster filling (non-exempt clubs), richest cap headroom first.
  //    Only sign a free agent if the team can afford them AND still keep
  //    draftReserve under the cap. Never sign above the cap.
  const order = state.teamOrder
    .filter((n) => !isContractExempt(n) && teams[n])
    .sort((a, b) => salaryCap - payrollOf(teams[a]) - (salaryCap - payrollOf(teams[b])))
    .reverse();

  for (const name of order) {
    let team = teams[name];
    const ownedPicks = (state.draftPicks ?? []).filter((pk) => pk.owner === name).length;
    const draftReserve = ownedPicks * ROOKIE_CONTRACT_COST;
    const effectiveCap = salaryCap - draftReserve;

    while (team.players.length < MIN_ROSTER && freeAgents.length > 0) {
      const headroom = effectiveCap - payrollOf(team);
      if (headroom < ROOKIE_CONTRACT_COST) break; // keep draft reserve
      // Highest-rated affordable free agent.
      const sorted = [...freeAgents].sort((a, b) => b.rating - a.rating);
      const pick = sorted.find((fa) => calculateMarketValue(fa.rating) <= headroom);
      if (!pick) break; // no affordable FA — don't force an over-cap signing
      const signing: LeaguePlayer = {
        ...pick,
        salary: calculateMarketValue(pick.rating),
        contractYears: 1,
        starter: false,
      };
      freeAgents = freeAgents.filter((fa) => fa !== pick);
      team = { ...team, players: [...team.players, signing] };
      actions.push({
        type: "EMERGENCY_SIGN",
        team: name,
        player: signing.name,
        detail: `Emergency 1yr signing at base value (${signing.salary}M).`,
      });
    }
    teams[name] = team;
  }

  return { teams, freeAgents, salaryCap, actions };
}

// ---------------- Second-phase free agency ------------------------------------
// After the contract cycle, user-controlled teams get first dibs on remaining
// free agents (handled manually via the UI). Then this AI phase lets non-exempt
// clubs with cap space — and room for their draft picks — sign remaining free
// agents. A team that is at or over its effective cap CANNOT sign anyone. A
// team CANNOT release a player it just signed in the contract cycle to make
// room — once signed, that's final.
//
// Behavioural contract (rebuilt from scratch, same observable behaviour):
//   1. Only AI-controlled (non-exempt) clubs participate.
//   2. Each club's effective cap = salaryCap − (owned draft picks × rookie cost).
//   3. A club needs at least one rookie-cost unit of headroom to be eligible.
//   4. Eligible clubs are ordered by most headroom first (poor clubs get priority).
//   5. Each club signs exactly one free agent per pass — the highest-rated
//      affordable one (market value ≤ headroom). One signing, then move on.
//   6. Signed players get a 1-year deal at their market value, non-starter.
//   7. The free-agent pool is mutated as clubs pick; once taken, a player is gone.
//   8. Missing/corrupt team entries are skipped rather than crashing.
export function runFreeAgencyCycle(state: LeagueState): {
  teams: Record<string, LeagueTeam>;
  freeAgents: LeaguePlayer[];
  actions: ContractAction[];
} {
  // A missing/zero cap is treated as unlimited so a corrupt save can't purge
  // every roster by making all wages "over cap".
  const capLimit = state.salaryCap > 0 ? state.salaryCap : Number.POSITIVE_INFINITY;
  const report: ContractAction[] = [];
  let pool = [...(state.freeAgents ?? [])];
  const nextTeams: Record<string, LeagueTeam> = {};

  for (const name of state.teamOrder) {
    const t = state.teams[name];
    if (!t) continue;
    nextTeams[name] = { ...t, players: [...t.players] };
  }

  const suitors = state.teamOrder
    .filter((n) => !isContractExempt(n) && nextTeams[n])
    .map((n) => {
      const picks = (state.draftPicks ?? []).filter((pk) => pk.owner === n).length;
      const reserve = picks * ROOKIE_CONTRACT_COST;
      const ceiling = capLimit - reserve;
      const space = ceiling - payrollOf(nextTeams[n]);
      return { name: n, ceiling, space };
    })
    .filter((s) => s.space >= ROOKIE_CONTRACT_COST)
    .sort((a, b) => b.space - a.space);

  for (const suitor of suitors) {
    if (pool.length === 0) break;
    const space = suitor.ceiling - payrollOf(nextTeams[suitor.name]);
    if (space < ROOKIE_CONTRACT_COST) continue;
    const ranked = [...pool].sort((a, b) => b.rating - a.rating);
    const target = ranked.find((fa) => calculateMarketValue(fa.rating) <= space);
    if (!target) continue;
    const signed: LeaguePlayer = {
      ...target,
      salary: calculateMarketValue(target.rating),
      contractYears: 1,
      starter: false,
    };
    pool = pool.filter((fa) => fa !== target);
    nextTeams[suitor.name] = {
      ...nextTeams[suitor.name],
      players: [...nextTeams[suitor.name].players, signed],
    };
    report.push({
      type: "EMERGENCY_SIGN",
      team: suitor.name,
      player: signed.name,
      detail: `Signed from free agency (${signed.salary}M, 1yr).`,
    });
  }

  return { teams: nextTeams, freeAgents: pool, actions: report };
}
