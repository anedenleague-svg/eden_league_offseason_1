import { useEffect, useRef, useState, useMemo, type ChangeEvent } from "react";
import {
  useLeague,
  ATTR_KEYS,
  isPlayerOut,
  SEASON_ENDING_WEEKS,
  buildLineupSlots,
  isValidFormation,
  blankPlayer,
  type AttrKey,
  type LineupSlot,
  type LeaguePlayer,
} from "@/state/league";
import { computeOverall } from "@/lib/ratings";
import { rpc } from "@/lib/rpc-client";
import { reportAiOutcome } from "@/lib/ai-status";
import { toast } from "sonner";
import { ARCHETYPES, randomArchetypeForPosition, POSITIONS } from "@/components/DraftSuite";
import { useNavigation } from "@/state/navigation";
import { isContractExempt } from "@/lib/engine-settings";
import { moraleLabel } from "@/lib/morale";
import { getTeamLogo, getTeamColors, normalizeHex, hexOrNoneDisplay } from "@/lib/team-branding";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NUM_COLS: { key: AttrKey; label: string }[] = [
  { key: "rating", label: "OVR" },
  { key: "FIN", label: "FIN" },
  { key: "SHO", label: "SHO" },
  { key: "PAS", label: "PAS" },
  { key: "VIS", label: "VIS" },
  { key: "DRI", label: "DRI" },
  { key: "PAC", label: "PAC" },
  { key: "STA", label: "STA" },
  { key: "DEF", label: "DEF" },
  { key: "TAC", label: "TAC" },
  { key: "POS_attr", label: "POS" },
  { key: "COM", label: "COM" },
  { key: "WR", label: "WR" },
  { key: "AGG", label: "AGG" },
  { key: "STR", label: "STR" },
  { key: "AER", label: "AER" },
  { key: "BCO", label: "BCO" },
];

// Base tactical identities the simulation engine scores against.
const TACTICAL_STYLES = [
  "Balanced",
  "Possession",
  "Counterattack",
  "Deep Block",
  "Chaos Attack",
  "High Press",
] as const;

function weeksLabel(weeks: number): string {
  if (weeks >= SEASON_ENDING_WEEKS) return "Season";
  return `${weeks} wk`;
}

export function TeamEditorSuite() {
  const {
    state,
    updateBudget,
    updatePlayer,
    setInjuryWeeks,
    setSuspensionWeeks,
    addPlayer,
    addCustomPlayer,
    removePlayer,
    renameTeam,
    setLineupSlot,
    setFormation,
    autoFillLineup,
    setTacticalStyle,
    setTeamLogo,
    setTeamColors,
    replaceManager,
    fireAndHireManager,
    setPlayerForSale,
    selectedUser,
    importTeam,
  } = useLeague();
  const { consumePayload } = useNavigation();
  const [showPlayerCreator, setShowPlayerCreator] = useState(false);
  const teamImportRef = useRef<HTMLInputElement | null>(null);
  const [pendingTeamImport, setPendingTeamImport] = useState<{
    name: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [team, setTeam] = useState(() => {
    if (selectedUser !== "commissioner") return selectedUser;
    return state.teamOrder[0];
  });

  // Lock selected team to selectedUser if in user mode
  useEffect(() => {
    if (selectedUser !== "commissioner" && team !== selectedUser) {
      setTeam(selectedUser);
    }
  }, [selectedUser, team]);

  const selectableTeams = useMemo(() => {
    if (selectedUser !== "commissioner") {
      return [selectedUser];
    }
    return state.teamOrder;
  }, [selectedUser, state.teamOrder]);

  const isReadOnly = selectedUser === "commissioner" && isContractExempt(team);

  function handleExportTeam() {
    const t = state.teams[team];
    if (!t) return;
    const exportData = {
      exportedAt: new Date().toISOString(),
      kind: "eden-team-export",
      team: {
        name: team,
        players: t.players,
        lineup: t.lineup,
        formation: t.formation,
        budget: t.budget,
        tactical_style: t.tactical_style,
        morale: t.morale,
        logo: t.logo,
        colors: t.colors,
      },
      manager: state.managers?.[team] ?? null,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eden-team-${team.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${team} successfully!`);
  }

  function onPickTeamImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "")) as Record<string, unknown>;
        setPendingTeamImport({ name: file.name, data: parsed });
      } catch (err) {
        toast.error(
          `Could not parse JSON: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    };
    reader.onerror = () => toast.error("Could not read the file.");
    reader.readAsText(file);
  }

  function handleConfirmTeamImport() {
    if (!pendingTeamImport) return;
    const res = importTeam(team, pendingTeamImport.data);
    if (!res.ok) {
      toast.error(`Import failed: ${res.error}`);
    } else {
      toast.success(`Team imported into ${team} successfully!`);
    }
    setPendingTeamImport(null);
  }

  // Honor a "View in Team Editor" jump from another suite (e.g. Player Search).
  useEffect(() => {
    if (selectedUser !== "commissioner") return;
    const payload = consumePayload();
    if (payload?.team && state.teams[payload.team]) setTeam(payload.team);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [nameDraft, setNameDraft] = useState(team);
  const [formationDraft, setFormationDraft] = useState("3-3-2");
  const manager = state.managers?.[team];
  const [mgrNameDraft, setMgrNameDraft] = useState(manager?.name ?? "");
  const [mgrDescDraft, setMgrDescDraft] = useState(manager?.personality ?? "");
  const [confirmFire, setConfirmFire] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const currentColors = getTeamColors(state.teams[team] ?? { name: team });
  const [primaryDraft, setPrimaryDraft] = useState(hexOrNoneDisplay(currentColors.primary));
  const [secondaryDraft, setSecondaryDraft] = useState(hexOrNoneDisplay(currentColors.secondary));
  const [tertiaryDraft, setTertiaryDraft] = useState(hexOrNoneDisplay(currentColors.tertiary));

  useEffect(() => {
    if (!state.teams[team]) setTeam(state.teamOrder[0]);
  }, [state.teams, state.teamOrder, team]);
  useEffect(() => {
    setNameDraft(team);
  }, [team]);
  useEffect(() => {
    if (state.teams[team]) setFormationDraft(state.teams[team].formation);
  }, [team, state.teams]);
  useEffect(() => {
    const m = state.managers?.[team];
    setMgrNameDraft(m?.name ?? "");
    setMgrDescDraft(m?.personality ?? "");
  }, [team, state.managers]);
  useEffect(() => {
    const c = getTeamColors(state.teams[team] ?? { name: team });
    setPrimaryDraft(hexOrNoneDisplay(c.primary));
    setSecondaryDraft(hexOrNoneDisplay(c.secondary));
    setTertiaryDraft(hexOrNoneDisplay(c.tertiary));
  }, [team, state.teams]);

  const t = state.teams[team];
  if (!t) return null;

  const isUserClub = isContractExempt(team);
  const isUserManager = (manager?.personality ?? "").trim().toUpperCase() === "USER CONTROLLED";
  // User-controlled managers CANNOT have a personality typed in — the AI
  // derives one behind the scenes from their actual behaviour (press quotes,
  // messages). So the textarea is locked to "USER CONTROLLED" for them.
  const mgrDirty =
    mgrNameDraft !== (manager?.name ?? "") ||
    (!isUserManager && mgrDescDraft !== (manager?.personality ?? ""));
  function fireAndHire() {
    const nextName = mgrNameDraft.trim();
    if (!nextName) return;
    const wasName = manager?.name ?? "";
    if (nextName === wasName) return; // no-op — button only fires on a real change
    setConfirmFire(true);
  }

  function executeFireAndHire() {
    const nextName = mgrNameDraft.trim();
    const personality = isUserManager
      ? "USER CONTROLLED"
      : mgrDescDraft.trim() || (manager?.personality ?? "");
    fireAndHireManager(team, { name: nextName, personality });
    setConfirmFire(false);
  }

  const payroll = t.players.reduce((s, p) => s + (p.salary ?? 0), 0);
  const slots = buildLineupSlots(t.formation);
  const starterCount = t.lineup.filter((n) => {
    const p = t.players.find((x) => x.name === n);
    return p && !isPlayerOut(p);
  }).length;
  const reserves = t.players.map((p, idx) => ({ p, idx })).filter(({ p }) => isPlayerOut(p));
  const ml = moraleLabel(t.morale);
  const moraleTone =
    ml.tone === "high"
      ? "text-success"
      : ml.tone === "low"
        ? "text-destructive"
        : "text-foreground";

  function saveName() {
    const next = nameDraft.trim();
    if (next && next !== team && !state.teams[next]) {
      renameTeam(team, next);
      setTeam(next);
    } else {
      setNameDraft(team);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Club
          </label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="w-64 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectableTeams.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Team Name (rename for promotion/relegation)
          </label>
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isReadOnly && saveName()}
              className="h-9 w-56 bg-card"
              disabled={isReadOnly}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={saveName}
              disabled={isReadOnly || nameDraft.trim() === team || !nameDraft.trim()}
            >
              SAVE NAME
            </Button>
            {/* Team logo picker (sits directly beside the name input) */}
            <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
                style={{
                  boxShadow: `0 0 0 2px ${currentColors.primary ?? "hsl(var(--muted-foreground))"}`,
                }}
              >
                {getTeamLogo(t) ? (
                  <img src={getTeamLogo(t)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {team.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isReadOnly}
                onChange={(e) => {
                  if (isReadOnly) return;
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const url = typeof reader.result === "string" ? reader.result : "";
                    if (url) setTeamLogo(team, url);
                  };
                  reader.readAsDataURL(file);
                  // reset so re-selecting the same file re-triggers
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => !isReadOnly && logoInputRef.current?.click()}
                disabled={isReadOnly}
              >
                CHOOSE LOGO
              </Button>
              {t.logo ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => !isReadOnly && setTeamLogo(team, null)}
                  title="Revert to the default seed logo"
                  disabled={isReadOnly}
                >
                  RESET
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Team Colors (hex — type NONE for empty)
          </label>
          <div className="flex items-center gap-2">
            {[
              {
                label: "Primary",
                draft: primaryDraft,
                set: setPrimaryDraft,
                key: "primary" as const,
              },
              {
                label: "Secondary",
                draft: secondaryDraft,
                set: setSecondaryDraft,
                key: "secondary" as const,
              },
              {
                label: "Tertiary",
                draft: tertiaryDraft,
                set: setTertiaryDraft,
                key: "tertiary" as const,
              },
            ].map((slot) => {
              const parsed = normalizeHex(slot.draft);
              return (
                <div key={slot.key} className="flex items-center gap-1">
                  <span
                    className="inline-block h-8 w-8 shrink-0 rounded-md border"
                    style={{
                      background: parsed ?? "transparent",
                      backgroundImage: parsed
                        ? undefined
                        : "repeating-linear-gradient(45deg, #eee 0 4px, #fff 4px 8px)",
                    }}
                    title={slot.label}
                  />
                  <Input
                    value={slot.draft}
                    onChange={(e) => !isReadOnly && slot.set(e.target.value.toUpperCase())}
                    onBlur={() => {
                      if (isReadOnly) return;
                      const val = normalizeHex(slot.draft);
                      const nextColors = {
                        primary: slot.key === "primary" ? val : normalizeHex(primaryDraft),
                        secondary: slot.key === "secondary" ? val : normalizeHex(secondaryDraft),
                        tertiary: slot.key === "tertiary" ? val : normalizeHex(tertiaryDraft),
                      };
                      setTeamColors(team, nextColors);
                      slot.set(hexOrNoneDisplay(val));
                    }}
                    placeholder="#RRGGBB or NONE"
                    className="h-8 w-28 bg-card font-mono text-xs uppercase"
                    aria-label={`${slot.label} color hex`}
                    disabled={isReadOnly}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Budget (Liquid Capital)
          </label>
          <input
            value={t.budget}
            onChange={(e) => !isReadOnly && updateBudget(team, e.target.value)}
            className="h-9 w-40 rounded-md border bg-card px-3 font-mono text-sm font-semibold"
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preferred Tactical Style
          </label>
          <Select
            value={t.tactical_style}
            onValueChange={(v) => !isReadOnly && setTacticalStyle(team, v)}
            disabled={isReadOnly}
          >
            <SelectTrigger className="h-9 w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TACTICAL_STYLES.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Team Data
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportTeam}
              className="font-semibold border-primary text-primary hover:bg-primary/10"
            >
              EXPORT TEAM
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => teamImportRef.current?.click()}
              className="font-semibold"
            >
              IMPORT TEAM
            </Button>
            <input
              ref={teamImportRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onPickTeamImportFile}
            />
          </div>
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <div>
            Team Morale:{" "}
            <span className={`font-semibold ${moraleTone}`}>
              {t.morale.toFixed(0)}% · {ml.text}
            </span>
          </div>
          <div>
            Active starters:{" "}
            <span
              className={
                starterCount === slots.length
                  ? "font-semibold text-success"
                  : "font-semibold text-destructive"
              }
            >
              {starterCount}/{slots.length}
            </span>
          </div>
          <div>
            Payroll:{" "}
            <span
              className={`font-semibold ${payroll > (state.salaryCap ?? Infinity) + 0.001 ? "text-destructive" : "text-foreground"}`}
            >
              ${payroll.toFixed(1)}M / ${(state.salaryCap ?? 0).toFixed(1)}M cap
            </span>
          </div>
          <div className="text-[10px]">
            {isUserClub
              ? "Contracts: negotiated via Contracts suite"
              : "Contracts: AI-managed (locked)"}
          </div>
        </div>
      </div>

      {/* Manager slot — kept separate from players */}
      <div className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">Manager</h3>
          {isContractExempt(team) && (
            <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              User Controlled
            </span>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Manager Name
            </label>
            <Input
              value={mgrNameDraft}
              onChange={(e) => setMgrNameDraft(e.target.value)}
              placeholder="Manager name"
              className="h-9 bg-card"
              disabled={isReadOnly}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Manager Description / Personality
            </label>
            <Textarea
              value={isUserManager ? "USER CONTROLLED" : mgrDescDraft}
              onChange={(e) => setMgrDescDraft(e.target.value)}
              placeholder="Negotiation personality and trading tendencies…"
              className="min-h-[72px] bg-card"
              disabled={isUserManager || isReadOnly}
              readOnly={isUserManager || isReadOnly}
            />
            {isUserManager && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                User-controlled managers can't type a personality — the AI derives one from your
                actual press quotes and messages.
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-300/60 bg-card/80 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Respect Rating
            </div>
            <div className="text-lg font-bold text-amber-900">
              {typeof manager?.respect === "number" ? manager.respect.toFixed(1) : "50.0"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              How the league press judges this manager. Moves via press conferences & weekly drift.
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/60 bg-card/80 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Harshness Rating
            </div>
            <div className="text-lg font-bold text-amber-900">
              {typeof manager?.harshness === "number" ? manager.harshness.toFixed(2) : "0.50"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ 1.00</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              0 = sugary, 0.5 = balanced, 1 = scathing. Averaged from press conference tone.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            variant="destructive"
            onClick={fireAndHire}
            disabled={
              isReadOnly || !mgrNameDraft.trim() || mgrNameDraft.trim() === (manager?.name ?? "")
            }
          >
            FIRE MANAGER AND HIRE NEW
          </Button>
          {/* Personality (for non-user clubs) can still be tweaked without a
              public sacking via the classic replaceManager path. */}
          {!isUserManager && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                replaceManager(team, {
                  name: mgrNameDraft.trim(),
                  personality: mgrDescDraft.trim(),
                })
              }
              disabled={isReadOnly || !mgrDirty || !mgrNameDraft.trim()}
            >
              SAVE PERSONALITY
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Firing is a PUBLIC action — rivals, press, and DMs may reference it.
          </p>

          <AlertDialog open={confirmFire} onOpenChange={setConfirmFire}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fire Manager and Hire New?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to{" "}
                  <strong>FIRE {manager?.name || "the current manager"}</strong> and{" "}
                  <strong>HIRE {mgrNameDraft.trim()}</strong>?
                  <br />
                  <br />
                  This is a <strong>PUBLIC</strong> action. It will:
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
                    <li>Reset respect to 50 and harshness to 0.5</li>
                    <li>Reset team and player morale to baseline</li>
                    <li>Clear every rival club's relationship rating with {team}</li>
                    <li>Wipe DM history for {team}</li>
                    <li>Get talked about in the press and around the league.</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={executeFireAndHire}
                >
                  Yes, Fire & Hire
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Formation pitch */}

      <div className="mb-6 rounded-xl border border-border bg-card/60 p-4 shadow-lg">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Formation (any rows; digits must total 8 outfielders)
            </label>
            <div className="flex gap-2">
              <Input
                value={formationDraft}
                onChange={(e) => setFormationDraft(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !isReadOnly &&
                  isValidFormation(formationDraft) &&
                  setFormation(team, formationDraft)
                }
                placeholder="3-3-2"
                className="h-9 w-32 bg-card font-mono"
                disabled={isReadOnly}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={isReadOnly || !isValidFormation(formationDraft)}
                onClick={() => setFormation(team, formationDraft)}
              >
                APPLY
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => autoFillLineup(team)}
                disabled={isReadOnly}
              >
                AUTO-FILL
              </Button>
            </div>
            {!isValidFormation(formationDraft) && (
              <p className="mt-1 text-xs text-destructive">
                Digits must sum to 8 (e.g. 3-3-2, 4-4, 2-3-2-1, 1-2-3-2).
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Any player can be slotted into any position. A simulation requires all 9 slots filled
            with healthy players.
          </p>
        </div>

        <PitchField
          slots={slots}
          team={team}
          t={t}
          setLineupSlot={setLineupSlot}
          isReadOnly={isReadOnly}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b bg-panel text-left font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 text-left">PLAYER</th>
              <th className="px-2 py-2 text-center">POS</th>
              <th className="px-1.5 py-2 text-center">AGE</th>
              <th className="px-1.5 py-2 text-center">MOR</th>
              <th className="px-1.5 py-2 text-center">SAL$M</th>
              <th className="px-1.5 py-2 text-center">YRS</th>
              {NUM_COLS.map((c) => (
                <th key={c.key} className="px-1.5 py-2 text-center">
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-2 text-center">HEALTH</th>
              <th className="px-1.5 py-2 text-center">INJ</th>
              <th className="px-1.5 py-2 text-center">SUS</th>
              <th
                className="px-2 py-2 text-center"
                title="List the player for sale to attract buyers"
              >
                SALE
              </th>
              <th className="px-2 py-2 text-center" />
            </tr>
          </thead>
          <tbody>
            {t.players.map((p, idx) => {
              const out = isPlayerOut(p);
              return (
                <tr
                  key={idx}
                  className={`border-b last:border-0 ${out ? "bg-destructive/10" : p.starter ? "bg-starter" : ""}`}
                >
                  <td className="px-1 py-1">
                    <input
                      value={p.name}
                      onChange={(e) =>
                        !isReadOnly && updatePlayer(team, idx, { name: e.target.value })
                      }
                      className="w-36 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                      disabled={isReadOnly}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      value={p.position}
                      onChange={(e) =>
                        !isReadOnly && updatePlayer(team, idx, { position: e.target.value })
                      }
                      className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-center uppercase hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                      disabled={isReadOnly}
                    />
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <input
                      type="number"
                      min={15}
                      max={45}
                      value={p.age}
                      onChange={(e) =>
                        !isReadOnly &&
                        updatePlayer(team, idx, { age: parseInt(e.target.value) || 0 })
                      }
                      className="w-11 rounded border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                      disabled={isReadOnly}
                    />
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {p.morale.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <span
                      title="Contracts are negotiated in the Contracts suite"
                      className="inline-block w-14 cursor-not-allowed rounded bg-muted px-1 py-0.5 text-center font-mono tabular-nums text-muted-foreground"
                    >
                      {(p.salary ?? 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <span
                      title="Contracts are negotiated in the Contracts suite"
                      className="inline-block w-11 cursor-not-allowed rounded bg-muted px-1 py-0.5 text-center font-mono tabular-nums text-muted-foreground"
                    >
                      {p.contractYears ?? 0}
                    </span>
                  </td>
                  {NUM_COLS.map((c) =>
                    c.key === "rating" ? (
                      <td key={c.key} className="px-0.5 py-1 text-center">
                        <span
                          title="Auto-calculated weighted average of attributes"
                          className="inline-block w-12 cursor-not-allowed rounded bg-muted px-1 py-0.5 text-center font-mono font-bold tabular-nums text-primary"
                        >
                          {p.rating.toFixed(1)}
                        </span>
                      </td>
                    ) : (
                      <td key={c.key} className="px-0.5 py-1 text-center">
                        <input
                          type="number"
                          step="0.1"
                          value={p[c.key]}
                          onChange={(e) =>
                            !isReadOnly &&
                            updatePlayer(team, idx, {
                              [c.key]: parseFloat(e.target.value) || 0,
                            } as never)
                          }
                          className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                          disabled={isReadOnly}
                        />
                      </td>
                    ),
                  )}
                  <td className="px-2 py-1 text-center">
                    {p.injuryWeeks > 0 ? (
                      <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive-foreground">
                        Injured
                      </span>
                    ) : p.suspensionWeeks > 0 ? (
                      <span className="rounded bg-muted-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase text-background">
                        Susp.
                      </span>
                    ) : (
                      <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-success-foreground">
                        Healthy
                      </span>
                    )}
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <input
                      type="number"
                      min={0}
                      value={p.injuryWeeks}
                      onChange={(e) =>
                        !isReadOnly && setInjuryWeeks(team, idx, parseInt(e.target.value) || 0)
                      }
                      className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                      disabled={isReadOnly}
                    />
                  </td>
                  <td className="px-0.5 py-1 text-center">
                    <input
                      type="number"
                      min={0}
                      value={p.suspensionWeeks}
                      onChange={(e) =>
                        !isReadOnly && setSuspensionWeeks(team, idx, parseInt(e.target.value) || 0)
                      }
                      className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums hover:border-border focus:border-ring focus:bg-card focus:outline-none disabled:opacity-50"
                      disabled={isReadOnly}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => !isReadOnly && setPlayerForSale(team, idx, !p.forSale)}
                      disabled={isReadOnly}
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                        p.forSale
                          ? "border-stadium-gold bg-stadium-gold text-emerald-950"
                          : "border-border bg-card text-muted-foreground hover:border-stadium-gold/60"
                      }`}
                      title={
                        p.forSale
                          ? "Click to take off the market"
                          : "Click to list publicly for sale — attracts more buyers"
                      }
                    >
                      {p.forSale ? "Listed" : "List"}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => !isReadOnly && removePlayer(team, idx)}
                      disabled={isReadOnly}
                      className="text-[11px] font-semibold text-destructive hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => setShowPlayerCreator(true)}
          className="font-semibold"
          disabled={isReadOnly}
        >
          + ADD PLAYER
        </Button>
        {showPlayerCreator && (
          <RosterPlayerCreator
            team={team}
            onAdd={(player) => {
              addCustomPlayer(team, player);
              setShowPlayerCreator(false);
            }}
            onCancel={() => setShowPlayerCreator(false)}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Assign your starting nine via the pitch above. AGE is editable (auto-seeded from a
          physical/mental profile and used by the offseason aging engine). MOR is rolling player
          morale. OVR is auto-calculated from attributes by position.
        </p>
      </div>

      <div className="mt-5 rounded-xl border bg-panel/40 p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">
          Injured / Suspended Reserve
        </h3>
        {reserves.length === 0 ? (
          <p className="text-xs text-muted-foreground">No players unavailable — full squad fit.</p>
        ) : (
          <ul className="divide-y">
            {reserves.map(({ p, idx }) => (
              <li key={idx} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="font-medium">
                  {p.name} <span className="text-muted-foreground">({p.position})</span>
                </span>
                <span className="flex gap-3 font-mono text-xs">
                  {p.injuryWeeks > 0 && (
                    <span className="text-destructive">
                      INJURY · {weeksLabel(p.injuryWeeks)} left
                    </span>
                  )}
                  {p.suspensionWeeks > 0 && (
                    <span className="text-muted-foreground">
                      SUSPENSION · {p.suspensionWeeks} wk left
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={pendingTeamImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTeamImport(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Team Data into {team}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to import <strong>{pendingTeamImport?.name}</strong> into{" "}
              <strong>{team}</strong>?
              <br />
              <br />
              This <strong>REPLACES</strong> the entire team — roster, lineup, formation, budget,
              tactical style, morale, colors, logo, and manager — with the contents of the file.
              <br />
              <br />
              You can <strong>↶ UNDO</strong> immediately after if it looks wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTeamImport}>
              Confirm Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PitchField({
  slots,
  team,
  t,
  setLineupSlot,
  isReadOnly,
}: {
  slots: LineupSlot[];
  team: string;
  t: { players: { name: string; position: string }[]; lineup: string[] };
  setLineupSlot: (team: string, slot: number, name: string) => void;
  isReadOnly: boolean;
}) {
  // Render outfield rows from attack (top) down to defense, GK at the very bottom.
  const lines = Array.from(new Set(slots.map((s) => s.line))).sort((a, b) => b - a);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-emerald-200/40 p-4 shadow-inner"
      style={{
        background:
          "repeating-linear-gradient(0deg, #1f9d4d 0px, #1f9d4d 36px, #178a43 36px, #178a43 72px)",
      }}
    >
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-3 rounded-md border-2 border-white/70" />
      <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0 -translate-y-1/2 border-t-2 border-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="pointer-events-none absolute left-1/2 top-3 h-12 w-40 -translate-x-1/2 border-2 border-t-0 border-white/70" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 h-12 w-40 -translate-x-1/2 border-2 border-b-0 border-white/70" />

      <div className="relative z-10 flex flex-col gap-4">
        {lines.map((line) => {
          const indices = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.line === line);
          return (
            <div key={line} className="flex flex-wrap justify-center gap-3">
              {indices.map(({ s, i }) => {
                const current = t.lineup[i] ?? "";
                const isGK = s.group === "GK";
                return (
                  <div
                    key={i}
                    className={`w-40 rounded-lg border p-1.5 shadow-md backdrop-blur ${
                      isGK ? "border-amber-300 bg-amber-100/90" : "border-white/60 bg-white/90"
                    }`}
                  >
                    <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                      {isGK ? "GK" : s.label}
                    </div>
                    <Select
                      value={current || "__none__"}
                      onValueChange={(v) =>
                        !isReadOnly && setLineupSlot(team, i, v === "__none__" ? "" : v)
                      }
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-8 w-full bg-card text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— empty —</SelectItem>
                        {t.players.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name} ({p.position})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ROSTER_ATTR_COLS: { key: keyof LeaguePlayer; label: string }[] = [
  { key: "FIN", label: "FIN" },
  { key: "SHO", label: "SHO" },
  { key: "PAS", label: "PAS" },
  { key: "VIS", label: "VIS" },
  { key: "DRI", label: "DRI" },
  { key: "PAC", label: "PAC" },
  { key: "STA", label: "STA" },
  { key: "DEF", label: "DEF" },
  { key: "TAC", label: "TAC" },
  { key: "POS_attr", label: "POS" },
  { key: "COM", label: "COM" },
  { key: "WR", label: "WR" },
  { key: "AGG", label: "AGG" },
  { key: "STR", label: "STR" },
  { key: "AER", label: "AER" },
  { key: "BCO", label: "BCO" },
];

function RosterPlayerCreator({
  team,
  onAdd,
  onCancel,
}: {
  team: string;
  onAdd: (p: LeaguePlayer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("NEW PLAYER");
  const [position, setPosition] = useState("CM");
  const [overall, setOverall] = useState("6.0");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<LeaguePlayer | null>(null);

  async function generate() {
    const ovr = parseFloat(overall);
    if (!name.trim() || !position.trim() || !Number.isFinite(ovr)) {
      toast.error("Fill in name, position, and overall first.");
      return;
    }
    setLoading(true);
    try {
      const { attributes, overall: exactOvr } = await rpc("generateProspectRatings", {
        data: {
          name: name.trim(),
          position: position.trim().toUpperCase(),
          overall: ovr,
          description:
            description.trim() || randomArchetypeForPosition(position.trim().toUpperCase()),
        },
      });
      const base = blankPlayer();
      const built: LeaguePlayer = {
        ...base,
        name: name.trim(),
        position: position.trim().toUpperCase(),
        ...attributes,
      };
      setSlot({ ...built, rating: exactOvr });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportAiOutcome(msg);
      if (msg.includes("RATE_LIMIT"))
        toast.error("AI is busy", { description: "Try again in a moment." });
      else if (msg.includes("CREDITS"))
        toast.error("AI credits exhausted", {
          description: "Add credits in Settings → Workspace → Usage.",
        });
      else
        toast.error("Couldn't generate ratings", {
          description: msg.slice(0, 200),
        });
    } finally {
      setLoading(false);
    }
  }

  function patch(key: keyof LeaguePlayer, value: number) {
    setSlot((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value } as LeaguePlayer;
      return { ...next, rating: computeOverall(next) };
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">
          AI Player Creator — {team}
        </h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          ✕ Cancel
        </Button>
      </div>

      {!slot ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Player Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Position
              </label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overall Rating (1–10)
              </label>
              <Input
                type="number"
                min={1}
                max={10}
                step="0.1"
                value={overall}
                onChange={(e) => setOverall(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✨</span>
              <label className="text-sm font-extrabold uppercase tracking-wider text-primary">
                AI Assistant
              </label>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">
              Describe the player's playstyle, strengths, and weaknesses. The AI will calibrate all
              15 attribute values to match. Leave blank to auto-select an archetype for this
              position.
            </p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A pacey winger who loves to cut inside, great dribbling and finishing but poor defensively."
              className="h-20 bg-background text-sm"
            />
            <div className="mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Quick-Fill Archetypes
                <span className="ml-1 normal-case font-normal">
                  — for {position || "all positions"}
                </span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ARCHETYPES.filter((a) => !position || a.positions.includes(position)).map((a) => (
                  <Button
                    key={a.label}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-7 text-[10px] font-medium border-primary/30 hover:bg-primary/10"
                    onClick={() => setDescription(a.desc)}
                  >
                    {a.emoji} {a.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={generate}
              disabled={loading}
              className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "✨ CALIBRATING ATTRIBUTES..." : "🔮 GENERATE AI RATINGS"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <Input
                value={slot.name}
                onChange={(e) => setSlot({ ...slot, name: e.target.value })}
                className="bg-background"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Position
              </label>
              <Select
                value={slot.position}
                onValueChange={(v) => setSlot({ ...slot, position: v })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Overall</div>
              <div className="text-2xl font-extrabold text-primary">{slot.rating.toFixed(1)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {ROSTER_ATTR_COLS.map((c) => (
              <div key={c.label}>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  step="0.1"
                  value={Number(slot[c.key])}
                  onChange={(e) => patch(c.key, parseFloat(e.target.value) || 0)}
                  className="bg-background text-center font-mono"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSlot(null)}>
              ← Re-generate
            </Button>
            <Button onClick={() => onAdd(slot)} className="font-semibold">
              ADD TO ROSTER
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
