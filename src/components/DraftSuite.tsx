import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { reportAiOutcome } from "@/lib/ai-status";
import { rpc } from "@/lib/rpc-client";
import { useLeague, prospectPlayer, DRAFT_POOL_SIZE, type LeaguePlayer } from "@/state/league";
import { useNavigation, type NegotiationSeedPayload } from "@/state/navigation";
import { computeOverall } from "@/lib/ratings";
import {
  buildTradeMarketBrief,
  buildAiPickProposal,
  pickLabel,
  type TradeProposal,
} from "@/lib/trades";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ATTR_COLS: { key: keyof LeaguePlayer; label: string }[] = [
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

export const POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "LWB",
  "RWB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
];

// Archetype presets: label, emoji, description, and the positions they suit best.
export const ARCHETYPES: {
  label: string;
  emoji: string;
  desc: string;
  positions: string[];
}[] = [
  // Goalkeeper
  {
    label: "Shot-Stopper GK",
    emoji: "🧤",
    desc: "An elite goalkeeper: superb shot-stopping reflexes, incredible aerial reach, and commanding communication, but barely useful with the ball at their feet.",
    positions: ["GK"],
  },
  {
    label: "Sweeper Keeper",
    emoji: "🦅",
    desc: "A ball-playing goalkeeper who sweeps up behind the defensive line, reads the game brilliantly, and distributes quickly, though pure shot-stopping isn't their strongest suit.",
    positions: ["GK"],
  },
  // Defenders
  {
    label: "Rock-Solid Wall",
    emoji: "🧱",
    desc: "An absolute wall of a central defender: extremely strong, aggressive, and dominant in the air with superb tackling, but has low pace and poor finishing.",
    positions: ["CB"],
  },
  {
    label: "Ball-Playing CB",
    emoji: "🎯",
    desc: "A technically gifted centre-back who controls the tempo from deep with precise passing and high vision, remains composed under pressure, though not the most physical.",
    positions: ["CB"],
  },
  {
    label: "Pace Monster CB",
    emoji: "💨",
    desc: "A lightning-fast central defender who recovers ground incredibly quickly to bail out the backline, but can be reckless in the tackle and struggles in the air.",
    positions: ["CB"],
  },
  {
    label: "Marauding Full-Back",
    emoji: "🏃",
    desc: "An attacking full-back with tremendous pace and stamina who flies up and down the flank all game, contributing heavily to attacks, but defensive positioning can be exposed.",
    positions: ["LB", "RB", "LWB", "RWB"],
  },
  {
    label: "Defensive Full-Back",
    emoji: "🛡️",
    desc: "A disciplined, solid full-back who stays compact, tackles cleanly, and rarely ventures forward, providing dependable cover, but offers nothing in attack.",
    positions: ["LB", "RB", "LWB", "RWB"],
  },
  {
    label: "Wing-Back Engine",
    emoji: "⚙️",
    desc: "A relentless wing-back with incredible stamina and pace who terrorises opponents up and down the flank for ninety minutes, crossing well and tracking back, though not a skilled finisher.",
    positions: ["LWB", "RWB"],
  },
  // Defensive / Central Midfielders
  {
    label: "Midfield Destroyer",
    emoji: "💣",
    desc: "A tenacious, physical holding midfielder who wins every second ball, breaks up play relentlessly, and shields the back four, but is technically limited and rarely creative.",
    positions: ["CDM", "CM"],
  },
  {
    label: "Midfield Maestro",
    emoji: "🧠",
    desc: "A brilliant, intelligent central midfielder with world-class passing and high vision who dictates tempo, but is physically weak and has very slow pace.",
    positions: ["CDM", "CM", "CAM"],
  },
  {
    label: "Box-to-Box Dynamo",
    emoji: "🔁",
    desc: "A tireless box-to-box midfielder with elite stamina who covers every blade of grass: solid defensively, consistently contributes with goals and assists, and never stops running.",
    positions: ["CM"],
  },
  {
    label: "Press King",
    emoji: "🐝",
    desc: "A high-energy pressing midfielder who harasses opponents relentlessly, wins the ball high up the pitch, and links play efficiently, though a bit one-dimensional technically.",
    positions: ["CM", "CDM"],
  },
  {
    label: "Advanced Playmaker",
    emoji: "🪄",
    desc: "A silky attacking midfielder with exceptional dribbling, vision, and passing who creates chances out of nothing in tight spaces, but does almost no defensive work whatsoever.",
    positions: ["CAM", "CM"],
  },
  {
    label: "Trequartista",
    emoji: "🎭",
    desc: "A creative free-roaming number ten with sublime technique and finishing, who operates in pockets behind the striker, ghosting past defenders, but rarely tracks back to defend.",
    positions: ["CAM"],
  },
  // Wide Midfielders / Wingers
  {
    label: "Speedster Winger",
    emoji: "⚡",
    desc: "An incredibly fast and direct winger who runs at defenders, beats them with pace and dribbling, and delivers dangerous crosses, but defensive contribution is near zero.",
    positions: ["LW", "RW", "LM", "RM"],
  },
  {
    label: "Inverted Winger",
    emoji: "🔀",
    desc: "A technical winger who cuts inside onto their stronger foot to shoot or thread incisive through-balls, possessing great finishing and vision, though weak physically.",
    positions: ["LW", "RW"],
  },
  {
    label: "Wide Workhorse",
    emoji: "🚂",
    desc: "A hard-working wide midfielder with excellent stamina who presses and tracks back as much as they attack, offering industry and reliability over flashes of brilliance.",
    positions: ["LM", "RM"],
  },
  // Forwards / Strikers
  {
    label: "Target Man",
    emoji: "🎯",
    desc: "A powerful, physically imposing striker who holds the ball up brilliantly, wins headers, lays off for teammates, and scores tap-ins, but lacks the speed to run in behind.",
    positions: ["ST"],
  },
  {
    label: "Speedster Striker",
    emoji: "🚀",
    desc: "A lightning-fast striker who is devastating in behind the defence, clinical one-on-one, with excellent finishing and pace, but weak in the air and poor at holding up play.",
    positions: ["ST"],
  },
  {
    label: "Poacher",
    emoji: "🦊",
    desc: "A clinical penalty-box poacher with instinctive positioning: always in the right place at the right time, lethal with either foot from close range, but contributes nothing outside the box.",
    positions: ["ST"],
  },
  {
    label: "Complete Striker",
    emoji: "👑",
    desc: "A well-rounded striker with strong finishing, decent pace, good aerial ability, and the vision to bring teammates into play; solid across the board but without a single elite trait.",
    positions: ["ST"],
  },
  {
    label: "False Nine",
    emoji: "🧩",
    desc: "A clever striker who drops deep to receive the ball, possesses exceptional passing and vision, and creates as much as they score, though they lack the physical dominance of a traditional striker.",
    positions: ["ST", "CAM"],
  },
];

export function randomArchetypeForPosition(position: string): string {
  const matches = ARCHETYPES.filter((a) => a.positions.includes(position));
  const pool = matches.length > 0 ? matches : ARCHETYPES;
  return pool[Math.floor(Math.random() * pool.length)].desc;
}

export function DraftSuite() {
  const { state } = useLeague();
  const champion = state.playoffs?.champion;
  const mvp = state.playoffs?.mvp;
  const draft = state.draft;

  // The Draft Suite is an offseason tool — locked until the season concludes
  // (a playoff champion has been crowned and Season MVP has been manually selected).
  if (!champion || !mvp) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-extrabold uppercase tracking-wide">
          Eden League Draft — Locked
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {!champion
            ? "The draft opens in the offseason. Finish the regular season, play the playoffs and crown a playoff champion in the Playoffs suite to unlock the draft pool."
            : "A champion has been crowned! Please manually award the Season MVP in the Schedule/Playoffs suite to unlock the draft pool."}
        </p>
      </div>
    );
  }

  if (draft?.started) {
    return <DraftBoard />;
  }
  return <DraftPool />;
}

// ---------------- Stage 1: prospect pool + creation ----------------
function DraftPool() {
  const { state, setDraftProspects, startDraft } = useLeague();
  const prospects = state.draft?.prospects ?? [];
  const [sortBy, setSortBy] = useState<"ovr" | "position" | "name">("ovr");
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  function parseImportSafe(text: string): number {
    try {
      return parseImport(text).length;
    } catch {
      return 0;
    }
  }

  const sorted = useMemo(() => {
    const copy = [...prospects];
    if (sortBy === "ovr") copy.sort((a, b) => b.rating - a.rating);
    else if (sortBy === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    else copy.sort((a, b) => a.position.localeCompare(b.position) || b.rating - a.rating);
    return copy;
  }, [prospects, sortBy]);

  const ATTR_MAP: Record<string, keyof LeaguePlayer> = {
    FIN: "FIN",
    SHO: "SHO",
    PAS: "PAS",
    VIS: "VIS",
    DRI: "DRI",
    PAC: "PAC",
    STA: "STA",
    DEF: "DEF",
    TAC: "TAC",
    POS: "POS_attr",
    COM: "COM",
    WR: "WR",
    AGG: "AGG",
    STR: "STR",
    AER: "AER",
  };

  function parseImport(jsonText: string): LeaguePlayer[] {
    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch {
      throw new Error("Invalid JSON — could not parse the file.");
    }
    if (!Array.isArray(data)) throw new Error("JSON must be an array of player objects.");
    const players: LeaguePlayer[] = [];
    for (const raw of data) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const name = String(r["PLAYER NAME"] ?? r["name"] ?? "").trim();
      const position = String(r["POSITION"] ?? r["position"] ?? "").trim().toUpperCase();
      const ovr = Number(r["OVR"] ?? r["overall"] ?? r["rating"] ?? 0);
      if (!name || !position || !Number.isFinite(ovr)) continue;
      const base = prospectPlayer();
      const player: LeaguePlayer = {
        ...base,
        name,
        position,
        rating: Math.max(1, Math.min(10, Math.round(ovr * 10) / 10)),
      };
      for (const [jsonKey, attrKey] of Object.entries(ATTR_MAP)) {
        const v = Number(r[jsonKey]);
        if (Number.isFinite(v)) {
          (player[attrKey] as number) = Math.max(1, Math.min(10, Math.round(v * 10) / 10));
        }
      }
      player.BCO = player.rating;
      players.push(player);
    }
    if (players.length === 0) throw new Error("No valid players found in the JSON.");
    return players;
  }

  function handleImport() {
    setImportErr(null);
    try {
      const parsed = parseImport(importText);
      setDraftProspects(parsed);
      setImportOpen(false);
      setImportText("");
      toast.success(`Imported ${parsed.length} prospects`, {
        description: `${parsed.length}/${DRAFT_POOL_SIZE} players loaded into the draft pool.`,
      });
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Failed to import.");
    }
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportText(text);
      setImportOpen(true);
    };
    reader.onerror = () => toast.error("Couldn't read the file.");
    reader.readAsText(file);
    e.target.value = "";
  }

  if (creating) {
    return (
      <ProspectCreator
        onCancel={() => setCreating(false)}
        onAdd={(p) => {
          setDraftProspects([...prospects, p]);
          setCreating(false);
        }}
      />
    );
  }

  const ready = prospects.length >= DRAFT_POOL_SIZE;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreating(true)} className="font-semibold">
            CREATE NEW PROSPECT PLAYER
          </Button>
          <Button
            variant="outline"
            className="font-semibold"
            onClick={() => {
              setImportErr(null);
              setImportOpen(true);
            }}
          >
            IMPORT DRAFT POOL
          </Button>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
            id="draft-pool-import-file"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById("draft-pool-import-file")?.click()}
          >
            Upload .json file
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sort by
          </span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-36 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ovr">Overall (high→low)</SelectItem>
              <SelectItem value="position">Position</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {importOpen && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">Import Draft Pool</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportText("");
                setImportErr(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste JSON below (an array of player objects with keys like{" "}
            <code className="rounded bg-muted px-1">PLAYER NAME</code>,{" "}
            <code className="rounded bg-muted px-1">POSITION</code>,{" "}
            <code className="rounded bg-muted px-1">OVR</code>, and the 15 attribute keys). Or use{" "}
            <span className="font-semibold">Upload .json file</span> above to load a file directly.
            This replaces the current prospect pool.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='[{"PLAYER NAME": "Sheep Droppings", "POSITION": "CAM", "OVR": 7.2, "FIN": 6.5, ...}]'
            className="h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          />
          {importErr && <p className="text-xs text-destructive">{importErr}</p>}
          <Button onClick={handleImport} className="font-semibold" disabled={!importText.trim()}>
            IMPORT {importText.trim() ? `(${parseImportSafe(importText)} players)` : ""}
          </Button>
        </div>
      )}

      <div className="rounded-lg border-l-4 border-stadium-gold bg-card px-4 py-2 text-xs text-muted-foreground">
        Prospect pool:{" "}
        <span className="font-semibold text-foreground">
          {prospects.length}/{DRAFT_POOL_SIZE}
        </span>
        . Create {Math.max(0, DRAFT_POOL_SIZE - prospects.length)} more to begin the 2-round,
        48-pick draft.
      </div>

      {prospects.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No prospects yet. Hit <span className="font-semibold">CREATE NEW PROSPECT PLAYER</span> to
          build the draft class.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-panel text-left font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">PROSPECT</th>
                <th className="px-2 py-2 text-center">POS</th>
                <th className="px-2 py-2 text-center">OVR</th>
                {ATTR_COLS.map((c) => (
                  <th key={c.label} className="px-1.5 py-2 text-center">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-b last:border-0">
                  <td className="px-2 py-1 font-semibold">{p.name}</td>
                  <td className="px-2 py-1 text-center">{p.position}</td>
                  <td className="px-2 py-1 text-center font-mono font-bold text-primary">
                    {p.rating.toFixed(1)}
                  </td>
                  {ATTR_COLS.map((c) => (
                    <td key={c.label} className="px-1.5 py-1 text-center font-mono tabular-nums">
                      {Number(p[c.key]).toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && (
        <div className="flex justify-center">
          <Button size="lg" onClick={startDraft} className="font-extrabold">
            START EDEN LEAGUE DRAFT
          </Button>
        </div>
      )}
    </div>
  );
}

function ProspectCreator({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (p: LeaguePlayer) => void;
}) {
  const [name, setName] = useState("NEW PROSPECT PLAYER");
  const [position, setPosition] = useState("CM");
  const [overall, setOverall] = useState("6.5");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<LeaguePlayer | null>(null);

  // Hydrate creator state from localStorage on mount
  useEffect(() => {
    try {
      const savedName = localStorage.getItem("draft-creator-name");
      if (savedName !== null) setName(savedName);
      const savedPos = localStorage.getItem("draft-creator-position");
      if (savedPos !== null) setPosition(savedPos);
      const savedOvr = localStorage.getItem("draft-creator-overall");
      if (savedOvr !== null) setOverall(savedOvr);
      const savedDesc = localStorage.getItem("draft-creator-description");
      if (savedDesc !== null) setDescription(savedDesc);
      const savedSlot = localStorage.getItem("draft-creator-slot");
      if (savedSlot !== null) setSlot(JSON.parse(savedSlot));
    } catch {}
  }, []);

  // Persist creator state to localStorage as it changes
  useEffect(() => {
    try {
      localStorage.setItem("draft-creator-name", name);
    } catch {}
  }, [name]);

  useEffect(() => {
    try {
      localStorage.setItem("draft-creator-position", position);
    } catch {}
  }, [position]);

  useEffect(() => {
    try {
      localStorage.setItem("draft-creator-overall", overall);
    } catch {}
  }, [overall]);

  useEffect(() => {
    try {
      localStorage.setItem("draft-creator-description", description);
    } catch {}
  }, [description]);

  useEffect(() => {
    try {
      if (slot) {
        localStorage.setItem("draft-creator-slot", JSON.stringify(slot));
      } else {
        localStorage.removeItem("draft-creator-slot");
      }
    } catch {}
  }, [slot]);

  const clearDraftCreator = () => {
    try {
      localStorage.removeItem("draft-creator-name");
      localStorage.removeItem("draft-creator-position");
      localStorage.removeItem("draft-creator-overall");
      localStorage.removeItem("draft-creator-description");
      localStorage.removeItem("draft-creator-slot");
    } catch {}
  };

  const handleCancel = () => {
    clearDraftCreator();
    onCancel();
  };

  const handleAdd = (p: LeaguePlayer) => {
    clearDraftCreator();
    onAdd(p);
  };

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
          description: description.trim() || randomArchetypeForPosition(position.trim().toUpperCase()),
        },
      });
      const base = prospectPlayer();
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
    <div className="space-y-5">
      <Button size="sm" variant="outline" onClick={handleCancel}>
        ← Back to pool
      </Button>

      {!slot ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-base font-extrabold uppercase tracking-wide">New Prospect</h2>
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

          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✨</span>
              <label className="text-sm font-extrabold uppercase tracking-wider text-primary">
                AI Assistant Draft Window
              </label>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">
              Describe the player's playstyle, archetypes, strengths, and weaknesses (e.g.{" "}
              <em>
                “This player is extremely strong, fast, and great in the air, but can't pass or
                tackle”
              </em>
              ). The AI will automatically interpret this and calibrate the 15 individual attribute
              values to match!
            </p>

            <textarea
              id="draft-ai-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. This player is extremely strong, has amazing pace, but is poor at defending and tackling."
              className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />

            <div className="mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Quick-Fill Archetype Presets
                <span className="ml-1 normal-case font-normal text-muted-foreground">
                  — showing archetypes for {position || "all positions"}
                </span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ARCHETYPES.filter(
                  (a) => !position || a.positions.includes(position),
                ).map((a) => (
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
                {position && ARCHETYPES.filter((a) => a.positions.includes(position)).length === 0 && (
                  ARCHETYPES.map((a) => (
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
                  ))
                )}
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            The AI engine will translate your requirements into a custom set of individual ratings.
            You'll be able to review and manually adjust them in the next step.
          </p>
          <div className="mt-4 flex justify-end">
            <Button
              id="btn-generate-ratings"
              onClick={generate}
              disabled={loading}
              className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "✨ CALIBRATING ATTRIBUTES..." : "🔮 GENERATE AI RATINGS"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <Input
                value={slot.name}
                onChange={(e) => setSlot({ ...slot, name: e.target.value })}
                className="w-56 bg-background"
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
                <SelectTrigger className="w-28 bg-background">
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
            {ATTR_COLS.map((c) => (
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

          <p className="mt-3 text-[11px] text-muted-foreground">
            Rookie contract is fixed at $2M / 2 years when drafted.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSlot(null)}>
              ← Re-generate
            </Button>
            <Button onClick={() => handleAdd(slot)} className="font-semibold">
              ADD PROSPECT PLAYER TO DRAFT POOL
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Stage 2: the draft board ----------------
function DraftBoard() {
  const {
    state,
    standings,
    selectProspect,
    executeTrade,
    executeManualTrade,
    resetDraft,
    selectedUser,
  } = useLeague();
  const { goToSuite } = useNavigation();

  const draft = state.draft!;
  const exemptList = state.settings?.contractExemptTeams ?? [];
  const isUser = (n: string) => exemptList.includes(n);

  const [proposals, setProposals] = useState<TradeProposal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [manualProspect, setManualProspect] = useState("");

  const pickIdToPick = useMemo(() => {
    const m = new Map(state.draftPicks.map((pk) => [pk.id, pk] as const));
    return m;
  }, [state.draftPicks]);

  if (draft.complete) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border bg-card p-8 text-center">
          <h2 className="text-lg font-extrabold uppercase tracking-wide">Draft Complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            All {draft.order.length} picks have been made. Rookies have joined their clubs on $2M /
            2yr deals.
          </p>
        </div>
        <DraftResults draft={draft} pickIdToPick={pickIdToPick} />
        <div className="flex justify-center">
          <Button variant="outline" onClick={resetDraft}>
            Clear draft board
          </Button>
        </div>
      </div>
    );
  }

  const currentPickId = draft.order[draft.currentPickIndex];
  const currentPick = pickIdToPick.get(currentPickId);
  const owner = currentPick?.owner ?? "";
  const ownerIsUser = selectedUser !== "commissioner" ? owner === selectedUser : isUser(owner);
  const available = draft.prospects;

  const roundOf = (i: number) => (i < state.teamOrder.length ? 1 : 2);
  const slotOf = (i: number) => (i % state.teamOrder.length) + 1;

  async function scanTrades() {
    if (scanning) return;
    setScanning(true);
    try {
      const rankOf = (team: string) => standings.find((s) => s.team === team)?.rank ?? 0;
      const brief = buildTradeMarketBrief(state, [], rankOf);
      const { proposals: raw } = await rpc("generateAiTradeProposals", { data: { brief, count: 10, allowPicks: true } });
      const validated: TradeProposal[] = [];
      const seen = new Set<string>();
      raw.forEach((p, i) => {
        const built = buildAiPickProposal(
          state,
          p.teamA,
          p.teamB,
          p.aSends,
          p.bSends,
          p.aPicks ?? [],
          p.bPicks ?? [],
          p.cashAReceives,
          p.cashBReceives,
          i,
        );
        if (!built) return;
        const key = `${built.teamA}|${built.aSends}|${(built.aPickIds ?? []).join(",")}|${built.teamB}|${built.bSends}|${(built.bPickIds ?? []).join(",")}`;
        if (seen.has(key)) return;
        seen.add(key);
        validated.push(built);
      });
      // Quality over quantity — only the best handful.
      validated.sort((a, b) => b.deltaUA + b.deltaUB - (a.deltaUA + a.deltaUB));
      setProposals(validated.slice(0, 5));
      if (validated.length === 0)
        toast.info("No strong trades", { description: "Nothing worth proposing this pick." });
      else
        toast.success("Trade scan complete", {
          description: `${Math.min(validated.length, 5)} proposal(s).`,
        });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportAiOutcome(msg);
      if (msg.includes("RATE_LIMIT"))
        toast.error("AI is busy", { description: "Try again in a moment." });
      else if (msg.includes("CREDITS"))
        toast.error("AI credits exhausted", {
          description: "Add credits in Settings → Workspace → Usage.",
        });
      else toast.error("Trade scan failed", { description: "Please try again." });
    } finally {
      setScanning(false);
    }
  }

  function acceptProposal(p: TradeProposal) {
    executeTrade(p);
    setProposals((list) => list.filter((x) => x.id !== p.id));
    toast.success("Trade completed", { description: `${p.teamA} ↔ ${p.teamB}` });
  }

  function declineProposal(p: TradeProposal) {
    setProposals((list) => list.filter((x) => x.id !== p.id));
  }

  function negotiateProposal(p: TradeProposal) {
    const userTeam = isUser(p.teamA) ? p.teamA : p.teamB;
    const aiTeam = userTeam === p.teamA ? p.teamB : p.teamA;
    const seed: NegotiationSeedPayload =
      userTeam === p.teamA
        ? {
            proposalId: p.id,
            userTeam,
            aiTeam,
            userSends: p.aSends ? [p.aSends] : [],
            aiSends: p.bSends ? [p.bSends] : [],
            cashUserReceives: p.cashAReceives,
            cashAiReceives: p.cashBReceives,
            userPicks: p.aPickIds ?? [],
            aiPicks: p.bPickIds ?? [],
          }
        : {
            proposalId: p.id,
            userTeam,
            aiTeam,
            userSends: p.bSends ? [p.bSends] : [],
            aiSends: p.aSends ? [p.aSends] : [],
            cashUserReceives: p.cashBReceives,
            cashAiReceives: p.cashAReceives,
            userPicks: p.bPickIds ?? [],
            aiPicks: p.aPickIds ?? [],
          };
    setProposals((list) => list.filter((x) => x.id !== p.id));
    goToSuite("Negotiation", { negotiationSeed: seed, returnSuite: "Draft" });
  }

  async function simulateAiPick() {
    if (picking || !currentPick) return;
    setPicking(true);
    try {
      const team = state.teams[owner];
      const rosterLines = team
        ? team.players
            .map((pl) => `  - ${pl.name} (${pl.position}, OVR ${pl.rating.toFixed(1)})`)
            .join("\n")
        : "(unknown roster)";
      const prospectLines = available
        .map((pr) => `  - ${pr.name} (${pr.position}, OVR ${pr.rating.toFixed(1)})`)
        .join("\n");
      const brief = [
        `${owner} current roster:`,
        rosterLines,
        ``,
        `Available prospects:`,
        prospectLines,
      ].join("\n");
      const { pick } = await rpc("aiDraftPick", {
        data: { team: owner, brief, prospectNames: available.map((p) => p.name) },
      });
      selectProspect(currentPickId, pick);
      toast.success(`${owner} selects ${pick}`);
      setProposals([]);
    } catch {
      // Fallback: take the highest-rated available prospect so the draft never stalls.
      const best = [...available].sort((a, b) => b.rating - a.rating)[0];
      if (best) {
        selectProspect(currentPickId, best.name);
        toast.success(`${owner} selects ${best.name}`);
      } else toast.error("No prospects left to pick.");
      setProposals([]);
    } finally {
      setPicking(false);
    }
  }

  function makeUserPick() {
    if (!manualProspect) {
      toast.error("Choose a prospect first.");
      return;
    }
    selectProspect(currentPickId, manualProspect);
    toast.success(`${owner} selects ${manualProspect}`);
    setManualProspect("");
    setProposals([]);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold uppercase tracking-wide">
              Pick #{draft.currentPickIndex + 1} — Round {roundOf(draft.currentPickIndex)}, Slot{" "}
              {slotOf(draft.currentPickIndex)}
            </h2>
            <p className="text-xs text-muted-foreground">
              On the clock: <span className="font-bold text-foreground">{owner}</span>
              {currentPick && currentPick.originalTeam !== owner && (
                <> (via {currentPick.originalTeam}, acquired by trade)</>
              )}
              {ownerIsUser && (
                <span className="ml-1 font-semibold text-stadium-gold">· Your pick</span>
              )}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={scanTrades} disabled={scanning}>
            {scanning ? "SCANNING…" : "SCAN FOR TRADES"}
          </Button>
        </div>

        {proposals.length > 0 && (
          <div className="mt-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Trade Proposals
            </h3>
            {proposals.map((p) => {
              const involvesUser =
                selectedUser !== "commissioner"
                  ? p.teamA === selectedUser || p.teamB === selectedUser
                  : isUser(p.teamA) || isUser(p.teamB);
              return (
                <div key={p.id} className="rounded-lg border bg-background p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DealSide
                      team={p.teamA}
                      player={p.aSends}
                      cash={p.cashBReceives}
                      pickIds={p.aPickIds ?? []}
                      pickIdToPick={pickIdToPick}
                    />
                    <DealSide
                      team={p.teamB}
                      player={p.bSends}
                      cash={p.cashAReceives}
                      pickIds={p.bPickIds ?? []}
                      pickIdToPick={pickIdToPick}
                    />
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    {involvesUser ? (
                      <Button size="sm" onClick={() => negotiateProposal(p)}>
                        NEGOTIATE
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => declineProposal(p)}>
                          DECLINE
                        </Button>
                        <Button size="sm" onClick={() => acceptProposal(p)}>
                          ACCEPT
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border-t pt-4">
          {ownerIsUser ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select a prospect
                </label>
                <Select value={manualProspect} onValueChange={setManualProspect}>
                  <SelectTrigger className="w-72 bg-background">
                    <SelectValue placeholder="Choose prospect…" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...available]
                      .sort((a, b) => b.rating - a.rating)
                      .map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name} — {p.position}, OVR {p.rating.toFixed(1)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={makeUserPick} className="font-semibold">
                DRAFT PLAYER
              </Button>
            </div>
          ) : (
            <Button onClick={simulateAiPick} disabled={picking} className="font-semibold">
              {picking ? "SELECTING…" : "SIMULATE PICK"}
            </Button>
          )}
        </div>
      </div>

      {/* Board overview */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b bg-panel text-left font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">R</th>
              <th className="px-2 py-2">OWNER</th>
              <th className="px-2 py-2">ORIGINAL</th>
              <th className="px-2 py-2">SELECTION</th>
            </tr>
          </thead>
          <tbody>
            {draft.order.map((pid, i) => {
              const pk = pickIdToPick.get(pid);
              const sel = draft.selections.find((s) => s.pickId === pid);
              const isCurrent = i === draft.currentPickIndex;
              return (
                <tr
                  key={pid}
                  className={`border-b last:border-0 ${isCurrent ? "bg-stadium-gold/15" : ""}`}
                >
                  <td className="px-2 py-1 font-mono">{i + 1}</td>
                  <td className="px-2 py-1">{roundOf(i)}</td>
                  <td className="px-2 py-1 font-semibold">
                    {pk?.owner ?? "—"}
                    {pk && isUser(pk.owner) && (
                      <span className="ml-1 text-[10px] text-stadium-gold">●</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{pk?.originalTeam ?? "—"}</td>
                  <td className="px-2 py-1">
                    {sel ? (
                      <span className="font-semibold">{sel.prospectName}</span>
                    ) : isCurrent ? (
                      <span className="italic text-muted-foreground">on the clock…</span>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DealSide({
  team,
  player,
  cash,
  pickIds,
  pickIdToPick,
}: {
  team: string;
  player: string;
  cash: number;
  pickIds: string[];
  pickIdToPick: Map<string, import("@/state/league").DraftPick>;
}) {
  const labels = pickIds.map((id) => {
    const p = pickIdToPick.get(id);
    return p ? pickLabel(p) : id;
  });
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-xs font-bold uppercase tracking-wide">{team} sends</div>
      <p className="mt-1 text-sm">
        {player || <span className="text-muted-foreground">—</span>}
        {labels.length > 0 && <span className="font-mono"> {labels.join(", ")}</span>}
        {cash > 0 && <span className="font-mono"> + ${cash}M</span>}
      </p>
    </div>
  );
}

function DraftResults({
  draft,
  pickIdToPick,
}: {
  draft: NonNullable<ReturnType<typeof useLeague>["state"]["draft"]>;
  pickIdToPick: Map<string, import("@/state/league").DraftPick>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-panel text-left font-bold uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">TEAM</th>
            <th className="px-2 py-2">SELECTION</th>
          </tr>
        </thead>
        <tbody>
          {draft.order.map((pid, i) => {
            const sel = draft.selections.find((s) => s.pickId === pid);
            const pk = pickIdToPick.get(pid);
            return (
              <tr key={pid} className="border-b last:border-0">
                <td className="px-2 py-1 font-mono">{i + 1}</td>
                <td className="px-2 py-1 font-semibold">{sel?.team ?? pk?.owner ?? "—"}</td>
                <td className="px-2 py-1">{sel?.prospectName ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
