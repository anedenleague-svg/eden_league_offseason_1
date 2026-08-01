import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LeagueProvider, useLeague } from "@/state/league";
import { StandingsSuite } from "@/components/StandingsSuite";
import { TeamEditorSuite } from "@/components/TeamEditorSuite";
import { TradesSuite } from "@/components/TradesSuite";
import { ContractsSuite } from "@/components/ContractsSuite";
import { SettingsSuite } from "@/components/SettingsSuite";
import { SaveVersionButton } from "@/components/SaveVersionButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { NewsSuite } from "@/components/NewsSuite";
import { NegotiationSuite } from "@/components/NegotiationSuite";
import { DraftSuite } from "@/components/DraftSuite";
import { MessagesSuite } from "@/components/MessagesSuite";
import { ManagerGenerationWatcher } from "@/components/ManagerGenerationWatcher";
import { AiPressConferenceWatcher } from "@/components/AiPressConferenceWatcher";
import { NewsAutogenWatcher } from "@/components/NewsAutogenWatcher";
import { AiProviderSyncer } from "@/components/AiProviderSyncer";
import { LeagueHistorySuite } from "@/components/LeagueHistorySuite";
import { NavigationProvider, useNavigation } from "@/state/navigation";
import { SeasonAnalysisSuite } from "@/components/SeasonAnalysisSuite";
import {
  restoreManagerMessages,
  type ManagerMessageRow,
} from "@/lib/league-export";
import { downloadOffseasonExport, downloadPartialOffseasonExport } from "@/lib/offseason-export";
import { getTeamColors } from "@/lib/team-branding";
import { Button } from "@/components/ui/button";
import { Lock, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
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
import edenLogo from "@/assets/eden-league-logo.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eden League Offseason Hub" },
      {
        name: "description",
        content:
          "Offseason management hub for the 24-team Eden League — import completed season data, run the draft, trades, contracts, and export offseason results.",
      },
      { property: "og:title", content: "Eden League Offseason Hub" },
      {
        property: "og:description",
        content:
          "Offseason draft, trades, contracts, and roster management for the Eden League.",
      },
    ],
  }),
  component: () => (
    <LeagueProvider>
      <LeagueAppWrapper />
    </LeagueProvider>
  ),
});

const COMMISSIONER_SUITES = [
  { name: "Season Analysis", render: () => <SeasonAnalysisSuite /> },
  { name: "League Standings", render: () => <StandingsSuite /> },
  { name: "Team Editor", render: () => <TeamEditorSuite /> },
  { name: "Newsroom", render: () => <NewsSuite /> },
  { name: "Trades", render: () => <TradesSuite /> },
  { name: "Draft", render: () => <DraftSuite /> },
  { name: "League History", render: () => <LeagueHistorySuite /> },
  { name: "Settings", render: () => <SettingsSuite /> },
];

const USER_SUITES = [
  { name: "Season Analysis", render: () => <SeasonAnalysisSuite /> },
  { name: "League Standings", render: () => <StandingsSuite /> },
  { name: "Team Editor", render: () => <TeamEditorSuite /> },
  { name: "Newsroom", render: () => <NewsSuite /> },
  { name: "Messages", render: () => <MessagesSuite /> },
  { name: "Negotiation", render: () => <NegotiationSuite /> },
  { name: "Contracts", render: () => <ContractsSuite /> },
  { name: "Draft", render: () => <DraftSuite /> },
];

function LeagueAppWrapper() {
  const { selectedUser } = useLeague();

  const suites = useMemo(() => {
    return selectedUser === "commissioner" ? COMMISSIONER_SUITES : USER_SUITES;
  }, [selectedUser]);

  const suiteNames = useMemo(() => suites.map((s) => s.name), [suites]);

  return (
    <NavigationProvider suites={suiteNames}>
      <Hub suites={suites} />
    </NavigationProvider>
  );
}

function Hub({ suites }: { suites: Array<{ name: string; render: () => React.ReactNode }> }) {
  const { index: idx, next, prev } = useNavigation();
  const { state, selectedUser, setSelectedUser } = useLeague();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Multi-window cooperative lock
  const [isLocked, setIsLocked] = useState(false);
  const windowSessionIdRef = useRef<string>("");
  if (!windowSessionIdRef.current && typeof window !== "undefined") {
    windowSessionIdRef.current = Math.random().toString(36).substring(2, 11);
  }
  const windowSessionId = windowSessionIdRef.current;

  useEffect(() => {
    if (!mounted) return;

    // Register this tab as the active session
    localStorage.setItem("eden_active_session_id", windowSessionId);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "eden_active_session_id") {
        if (e.newValue && e.newValue !== windowSessionId) {
          setIsLocked(true);
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    // Cross-tab lock handovers
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("eden_league_session_lock");
      bc.onmessage = (e) => {
        if (e.data?.type === "closed") {
          const activeId = localStorage.getItem("eden_active_session_id");
          if (!activeId) {
            localStorage.setItem("eden_active_session_id", windowSessionId);
            setIsLocked(false);
          }
        } else if (e.data?.type === "acquire" && e.data?.sessionId !== windowSessionId) {
          setIsLocked(true);
        }
      };
    } catch {
      console.debug("BroadcastChannel init failed");
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (bc) {
        try {
          if (localStorage.getItem("eden_active_session_id") === windowSessionId) {
            localStorage.removeItem("eden_active_session_id");
            bc.postMessage({ type: "closed", sessionId: windowSessionId });
          }
          bc.close();
        } catch {
          console.debug("BroadcastChannel close failed");
        }
      }
    };
  }, [mounted, windowSessionId]);

  const acquireLock = () => {
    localStorage.setItem("eden_active_session_id", windowSessionId);
    setIsLocked(false);
    try {
      const bc = new BroadcastChannel("eden_league_session_lock");
      bc.postMessage({ type: "acquire", sessionId: windowSessionId });
      bc.close();
    } catch {
      console.debug("BroadcastChannel acquire failed");
    }
  };

  const userControlledTeams = useMemo(() => {
    return Object.entries(state.managers)
      .filter(([_, m]) => (m.personality ?? "").trim().toUpperCase() === "USER CONTROLLED")
      .map(([teamName, m]) => ({
        team: teamName,
        manager: m.name,
      }));
  }, [state.managers]);

  const dynamicBgStyle = useMemo(() => {
    if (!mounted || selectedUser === "commissioner") {
      return {};
    }
    const t = state.teams[selectedUser];
    const colors = getTeamColors(t ?? { name: selectedUser });
    const primary = colors.primary ?? "#1f9d4d";
    const secondary = colors.secondary ?? "#ffffff";

    // Team-branded linear gradient matching exact hex key in top-left, fading lighter down & right
    const gradient = `linear-gradient(160deg, ${primary} 0%, color-mix(in srgb, ${primary} 35%, white) 55%, color-mix(in srgb, ${primary} 10%, white) 100%)`;

    return {
      backgroundImage: `${gradient}, repeating-linear-gradient(90deg, color-mix(in oklab, #ffffff 6%, transparent) 0 56px, transparent 56px 112px)`,
      backgroundAttachment: "fixed",
      // Secondary background accents and tailwind override custom properties
      "--primary": primary,
      "--border": `color-mix(in srgb, ${primary} 25%, transparent)`,
      "--highlight-blue": primary,
      "--highlight-red": secondary,
    } as React.CSSProperties;
  }, [mounted, selectedUser, state.teams]);

  return (
    <div className="min-h-screen" style={dynamicBgStyle}>
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="max-w-md rounded-2xl border bg-card p-8 shadow-2xl text-center flex flex-col items-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4 text-destructive">
              <Lock className="h-8 w-8 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">Conflicting Session Detected</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Another window or tab of the Eden League Offseason Hub is currently active. To prevent
              conflicting changes and database corruption, operations in this tab have been
              suspended.
            </p>
            <Button onClick={acquireLock} className="w-full flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Acquire Lock & Resume
            </Button>
          </div>
        </div>
      )}

      <ManagerGenerationWatcher />
      <AiPressConferenceWatcher />
      <NewsAutogenWatcher />
      <AiProviderSyncer />
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div
          className="h-1 w-full"
          style={
            selectedUser !== "commissioner"
              ? {
                  background: `linear-gradient(90deg, var(--primary) 0%, var(--highlight-red) 100%)`,
                }
              : { backgroundImage: "var(--gradient-rb)" }
          }
        />
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="relative flex items-center justify-center gap-2 min-h-[44px]">
            {/* Left Side: Active Role Dropdown Selector */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
              <label htmlFor="role-select" className="sr-only">
                Active Role
              </label>
              <select
                id="role-select"
                value={mounted ? selectedUser : "commissioner"}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="h-8 rounded-lg border bg-background px-2.5 py-1 text-xs font-bold text-highlight-blue focus:outline-none focus:ring-1 focus:ring-highlight-blue cursor-pointer shadow-sm hover:bg-secondary/25 transition-colors"
              >
                <option value="commissioner">League Commissioner</option>
                {mounted &&
                  userControlledTeams.map(({ team, manager }) => (
                    <option key={team} value={team}>
                      {team} ({manager})
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={prev}
              aria-label="Previous suite"
              className="ml-auto select-none px-3 py-1 text-2xl font-bold text-highlight-blue transition-colors hover:opacity-70 z-10"
            >
              ‹
            </button>
            <div className="flex flex-col items-center text-center w-[280px] sm:w-[320px] md:w-[360px] shrink-0 px-2">
              <div className="flex items-center gap-2">
                <img src={edenLogo} alt="Eden League crest" className="h-8 w-8 object-contain" />
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Eden League Offseason Hub
                </div>
              </div>
              <h1 className="text-lg font-extrabold tracking-tight sm:text-xl truncate max-w-full">
                {suites[idx]?.name || "Season Analysis"}
              </h1>
            </div>
            <button
              onClick={next}
              aria-label="Next suite"
              className="mr-auto select-none px-3 py-1 text-2xl font-bold text-highlight-red transition-colors hover:opacity-70 z-10"
            >
              ›
            </button>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
              <NotificationCenter />
            </div>
          </div>
          <Toolbar />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {mounted && suites[idx] ? (
          suites[idx].render()
        ) : (
          <div className="py-20 text-center text-sm text-muted-foreground">
            Loading league state…
          </div>
        )}
      </main>
    </div>
  );
}

function Toolbar() {
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    state,
    standings,
    leaderboards,
    importLeagueExport,
    importPartialOffseason,
  } = useLeague();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const partialFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [pendingPartialImport, setPendingPartialImport] = useState<{
    name: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [pendingExport, setPendingExport] = useState(false);
  const [pendingPartialExport, setPendingPartialExport] = useState(false);
  const [leagueImported, setLeagueImported] = useState(false);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "")) as Record<string, unknown>;
        setPendingImport({ name: file.name, data: parsed });
      } catch (err) {
        toast.error(
          `Could not parse JSON: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    };
    reader.onerror = () => toast.error("Could not read the file.");
    reader.readAsText(file);
  };

  const handleImportConfirm = () => {
    if (!pendingImport) return;
    try {
      const res = importLeagueExport(pendingImport.data);
      if (!res.ok) {
        toast.error(`Import failed: ${res.error}`);
        setPendingImport(null);
        return;
      }
      // Restore the Cloud-only DM history (lives outside LeagueState).
      const msgs = Array.isArray(pendingImport.data.messages)
        ? (pendingImport.data.messages as ManagerMessageRow[])
        : [];
      void restoreManagerMessages(msgs).catch((err) => {
        console.warn("[import] DM restore failed", err);
      });
      setLeagueImported(true);
      toast.success("League state imported successfully!");
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    setPendingImport(null);
  };

  const onPickPartialFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "")) as Record<string, unknown>;
        setPendingPartialImport({ name: file.name, data: parsed });
      } catch (err) {
        toast.error(
          `Could not parse JSON: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    };
    reader.onerror = () => toast.error("Could not read the file.");
    reader.readAsText(file);
  };

  const handlePartialImportConfirm = () => {
    if (!pendingPartialImport) return;
    try {
      const res = importPartialOffseason(pendingPartialImport.data);
      if (!res.ok) {
        toast.error(`Import failed: ${res.error}`);
        setPendingPartialImport(null);
        return;
      }
      const msgs = Array.isArray(pendingPartialImport.data.messages)
        ? (pendingPartialImport.data.messages as ManagerMessageRow[])
        : [];
      void restoreManagerMessages(msgs).catch((err) => {
        console.warn("[import] DM restore failed", err);
      });
      toast.success("Partial offseason state restored successfully!");
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    setPendingPartialImport(null);
  };

  const handleExportPartialOffseason = async () => {
    setPendingPartialExport(true);
    try {
      await downloadPartialOffseasonExport(state, standings, leaderboards);
      toast.success("Partial offseason data exported successfully!");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setPendingPartialExport(false);
    }
  };

  const handleExportOffseason = async () => {
    setPendingExport(true);
    try {
      await downloadOffseasonExport(state, standings, leaderboards);
      toast.success("Offseason data exported successfully!");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setPendingExport(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        onClick={undo}
        disabled={!canUndo}
        title="Undo the last action across any suite"
        className="font-semibold"
      >
        ↶ UNDO
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={redo}
        disabled={!canRedo}
        title="Redo the last undone action"
        className="font-semibold"
      >
        ↷ REDO
      </Button>
      <SaveVersionButton />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        title="Import completed season data from the main Eden League app (replaces current league)"
        className="font-semibold"
      >
        ⬆ IMPORT LEAGUE DATA
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExportOffseason}
        disabled={pendingExport}
        title="Export offseason results — ages all players, advances to next season, and downloads a JSON file to import back into the main app"
        className="font-semibold border-primary text-primary hover:bg-primary/10"
      >
        {pendingExport ? "EXPORTING…" : "⬇ EXPORT OFFSEASON DATA"}
      </Button>
      {leagueImported && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPartialOffseason}
            disabled={pendingPartialExport}
            title="Save a mid-offseason checkpoint — downloads a JSON file you can restore with IMPORT PARTIAL OFFSEASON DATA"
            className="font-semibold border-amber-500/60 text-amber-700 hover:bg-amber-50"
          >
            {pendingPartialExport ? "EXPORTING…" : "⬇ EXPORT PARTIAL OFFSEASON DATA"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => partialFileRef.current?.click()}
            title="Restore a mid-offseason checkpoint — resets the offseason state to when you exported the file, keeping the initial league import"
            className="font-semibold border-amber-500/60 text-amber-700 hover:bg-amber-50"
          >
            ⬆ IMPORT PARTIAL OFFSEASON DATA
          </Button>
          <input
            ref={partialFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onPickPartialFile}
          />
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onPickFile}
      />

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import League Data?</AlertDialogTitle>
          <AlertDialogDescription>
              Are you sure you want to import <strong>{pendingImport?.name}</strong>?
              <br />
              <br />
              This <strong>REPLACES</strong> the current league (teams, rosters, schedule, results,
              standings, managers, relations, settings, DM history) with the contents of the file.
              <br />
              <br />
              You can <strong>↶ UNDO</strong> the league-state part immediately after if it looks
              wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm}>Confirm Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingPartialImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPartialImport(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Partial Offseason Data?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to import <strong>{pendingPartialImport?.name}</strong>?
            <br />
            <br />
            This <strong>RESETS</strong> the offseason state to the moment you exported this file.
            The initial league import is kept — only the offseason progress is rolled back.
            <br />
            <br />
            You can <strong>↶ UNDO</strong> the league-state part immediately after if it looks
            wrong.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handlePartialImportConfirm}>Confirm Import</AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
