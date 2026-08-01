// Overall Rating Automation.
// A player's OVR ("rating") is a position-weighted average of their attribute
// ratings, rounded to one decimal. It is recomputed every time an attribute
// changes and is never edited directly by the user.
import type { LeaguePlayer } from "@/state/league";

type AttrField = Exclude<
  keyof LeaguePlayer,
  "name" | "position" | "starter" | "injuryWeeks" | "suspensionWeeks" | "rating" | "yellowLog"
>;

type WeightMap = Partial<Record<AttrField, number>>;

const ATTACKER: WeightMap = {
  FIN: 0.3,
  SHO: 0.2,
  POS_attr: 0.15,
  PAC: 0.1,
  DRI: 0.1,
  COM: 0.05,
  PAS: 0.05,
  AER: 0.05,
};
const WINGER: WeightMap = {
  DRI: 0.25,
  PAC: 0.2,
  FIN: 0.15,
  SHO: 0.1,
  PAS: 0.1,
  VIS: 0.1,
  WR: 0.1,
};
const CAM: WeightMap = {
  VIS: 0.25,
  PAS: 0.25,
  DRI: 0.15,
  FIN: 0.1,
  SHO: 0.1,
  COM: 0.1,
  PAC: 0.05,
};
const CENTRAL_MID: WeightMap = {
  PAS: 0.25,
  VIS: 0.2,
  STA: 0.15,
  DRI: 0.1,
  DEF: 0.1,
  TAC: 0.1,
  WR: 0.1,
};
const CDM: WeightMap = {
  DEF: 0.2,
  TAC: 0.2,
  PAS: 0.2,
  VIS: 0.15,
  POS_attr: 0.15,
  STR: 0.1,
};
const CENTER_BACK: WeightMap = {
  DEF: 0.3,
  TAC: 0.25,
  POS_attr: 0.15,
  STR: 0.15,
  AER: 0.1,
  PAC: 0.05,
};
const FULL_BACK: WeightMap = {
  DEF: 0.2,
  TAC: 0.2,
  PAC: 0.2,
  STA: 0.15,
  WR: 0.15,
  PAS: 0.1,
};
const GOALKEEPER: WeightMap = {
  COM: 0.3,
  POS_attr: 0.25,
  DEF: 0.2,
  AER: 0.1,
  PAS: 0.1,
  VIS: 0.05,
};
const BALANCED: WeightMap = {
  FIN: 0.07,
  SHO: 0.07,
  PAS: 0.07,
  VIS: 0.07,
  DRI: 0.07,
  PAC: 0.07,
  STA: 0.07,
  DEF: 0.07,
  TAC: 0.07,
  POS_attr: 0.07,
  COM: 0.07,
  WR: 0.07,
  AGG: 0.05,
  STR: 0.05,
  AER: 0.05,
};

function weightsFor(position: string): WeightMap {
  const pos = position.toUpperCase().trim();
  if (pos === "GK") return GOALKEEPER;
  if (["ST", "CF"].includes(pos)) return ATTACKER;
  if (["LW", "RW", "WINGER"].includes(pos)) return WINGER;
  if (pos === "CAM") return CAM;
  if (pos === "CDM") return CDM;
  if (["CM", "LM", "RM"].includes(pos)) return CENTRAL_MID;
  if (["CB"].includes(pos)) return CENTER_BACK;
  if (["LB", "RB", "LWB", "RWB", "FB"].includes(pos)) return FULL_BACK;
  return BALANCED;
}

export function computeOverall(p: LeaguePlayer): number {
  const w = weightsFor(p.position);
  let total = 0;
  let weightSum = 0;
  for (const key in w) {
    const field = key as AttrField;
    const weight = w[field] ?? 0;
    const value = (p[field] as number) ?? 0;
    total += value * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return p.rating;
  return Math.round((total / weightSum) * 10) / 10;
}

const ATTR_KEYS: AttrField[] = [
  "FIN",
  "SHO",
  "PAS",
  "VIS",
  "DRI",
  "PAC",
  "STA",
  "DEF",
  "TAC",
  "POS_attr",
  "COM",
  "WR",
  "AGG",
  "STR",
  "AER",
];

function weightedAverage(attrs: Record<string, number>, position: string): number {
  const w = weightsFor(position);
  let total = 0;
  let weightSum = 0;
  for (const key in w) {
    const field = key as AttrField;
    const weight = w[field] ?? 0;
    const value = (attrs[field] as number) ?? 0;
    total += value * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return total / weightSum;
}

// Deterministically shifts a themed attribute spread so that the position-
// weighted overall rounds to EXACTLY `target`. A constant shift preserves the
// relative shape (description-driven strengths/weaknesses); when clamping
// against the 1–10 bounds prevents a full shift, the residual is distributed
// across the attributes that still have room. A final micro-adjustment pass
// tweaks individual attributes by ±0.1 so that computeOverall() on the result
// returns `target` exactly (critical: the league normalize() function
// recomputes rating from attributes, so the attributes MUST produce the target
// on their own — setting rating directly is not enough).
export function normalizeAttributesToOverall(
  attrs: Record<string, number>,
  position: string,
  target: number,
): Record<string, number> {
  const t = Math.max(1, Math.min(10, Math.round(target * 10) / 10));
  const result: Record<string, number> = {};
  for (const k of ATTR_KEYS) {
    result[k] = Math.max(1, Math.min(10, Math.round((attrs[k] ?? 0) * 10) / 10));
  }

  // Phase 1: iterative constant shift to get close to target.
  for (let iter = 0; iter < 100; iter++) {
    const cur = weightedAverage(result, position);
    if (Math.abs(cur - t) < 0.005) break;
    const delta = t - cur;
    const movable = ATTR_KEYS.filter((k) => (delta > 0 ? result[k] < 10 : result[k] > 1));
    if (movable.length === 0) break;
    const per = delta / movable.length;
    for (const k of movable) {
      result[k] = Math.max(1, Math.min(10, result[k] + per));
    }
    for (const k of ATTR_KEYS) {
      result[k] = Math.max(1, Math.min(10, Math.round(result[k] * 10) / 10));
    }
  }

  // Phase 2: micro-adjustment. After rounding, the weighted average might be
  // just outside the rounding band. Try adjusting each attribute by ±0.1 and
  // keep the change that brings computeOverall() closest to target. Repeat
  // until exact or no improvement possible.
  const round1 = (x: number) => Math.round(x * 10) / 10;
  for (let pass = 0; pass < 30; pass++) {
    const cur = weightedAverage(result, position);
    if (round1(cur) === t) return result;

    let bestKey: AttrField | null = null;
    let bestDelta = 0;
    let bestDist = Math.abs(round1(cur) - t);

    for (const k of ATTR_KEYS) {
      for (const d of [-0.1, 0.1]) {
        const v = result[k] + d;
        if (v < 1 || v > 10) continue;
        const copy = { ...result, [k]: v };
        const wa = weightedAverage(copy, position);
        const dist = Math.abs(round1(wa) - t);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = k;
          bestDelta = d;
        }
      }
    }
    if (bestKey === null) break;
    result[bestKey] = Math.max(1, Math.min(10, result[bestKey] + bestDelta));
    result[bestKey] = round1(result[bestKey]);
  }

  return result;
}
