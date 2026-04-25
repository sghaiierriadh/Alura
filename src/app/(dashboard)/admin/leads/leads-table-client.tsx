"use client";

import {
  loadLeadConversation,
  type LeadConversationMessage,
} from "@/app/actions/admin-leads";
import { ConversationSheet } from "@/components/admin/conversation-sheet";
import { DataTable, type DataTableColumn as Col } from "@/components/admin/data-table";
import { LeadConversationBubbles } from "@/components/admin/lead-conversation-bubbles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/types/database.types";
import { CalendarRange, MessageCircle, RotateCcw, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

type PanelState =
  | "idle"
  | "loading"
  | "messages"
  | "empty-thread"
  | "no-session"
  | "lead-missing"
  | "error";

const SOURCE_ALL = "all";

function formatDateFr(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function dash(v: string | null | undefined) {
  const t = v?.trim();
  return t && t.length > 0 ? t : "—";
}

function leadDateKey(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function sourceLabel(src: string | null | undefined) {
  const s = (src ?? "unknown").trim();
  const map: Record<string, string> = {
    widget: "Widget",
    embed: "Embed",
    dashboard: "Dashboard",
    api: "API",
    unknown: "—",
  };
  return map[s] ?? s;
}

function EmptyThreadMessage() {
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-6 py-10 text-center dark:border-zinc-700/80 dark:bg-zinc-900/50">
      <p className="text-sm font-medium tracking-wide text-zinc-700 dark:text-zinc-200">
        Aucune discussion enregistrée pour le moment
      </p>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        La session est bien liée à ce contact, mais aucun message n’a encore été persisté pour cette
        conversation.
      </p>
    </div>
  );
}

function LeadMissingMessage() {
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-6 py-10 text-center dark:border-zinc-700/80 dark:bg-zinc-900/50">
      <p className="text-sm font-medium tracking-wide text-zinc-700 dark:text-zinc-200">
        Lead introuvable
      </p>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Ce contact n’est plus disponible ou l’identifiant n’est plus valide.
      </p>
    </div>
  );
}

export function LeadsTableClient({ leads }: { leads: LeadRow[] }) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState(SOURCE_ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [panel, setPanel] = useState<PanelState>("idle");
  const [activeLead, setActiveLead] = useState<LeadRow | null>(null);
  const [messages, setMessages] = useState<LeadConversationMessage[]>([]);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((row) => {
      if (sourceFilter !== SOURCE_ALL && (row.source ?? "unknown") !== sourceFilter) return false;
      const d = leadDateKey(row.created_at);
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo && d && d > dateTo) return false;
      if (q.length > 0) {
        const blob = [row.full_name, row.email, row.phone, row.last_question]
          .map((x) => (x ?? "").toLowerCase())
          .join(" ");
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, sourceFilter, dateFrom, dateTo]);

  const openConversation = useCallback((lead: LeadRow) => {
    setActiveLead(lead);
    setSheetOpen(true);
    setPanel("loading");
    setMessages([]);
    setSheetError(null);
    void (async () => {
      const r = await loadLeadConversation(lead.id);
      if (r.ok) {
        setMessages(r.messages);
        if (!r.hasSession) {
          setPanel("no-session");
        } else if (r.messages.length === 0) {
          setPanel("empty-thread");
        } else {
          setPanel("messages");
        }
      } else {
        const notFound = r.error.toLowerCase().includes("lead introuvable");
        if (notFound) {
          setPanel("lead-missing");
        } else {
          setPanel("error");
          setSheetError(r.error);
          toast.error(r.error);
        }
      }
    })();
  }, []);

  const columns: Col<LeadRow>[] = [
    {
      id: "name",
      header: "Nom",
      cell: (row) => <span className="font-medium text-zinc-900 dark:text-zinc-50">{dash(row.full_name)}</span>,
    },
    {
      id: "email",
      header: "Email",
      cell: (row) => <span className="text-zinc-700 dark:text-zinc-300">{dash(row.email)}</span>,
    },
    {
      id: "phone",
      header: "Téléphone",
      cell: (row) => <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{dash(row.phone)}</span>,
    },
    {
      id: "source",
      header: "Source",
      cell: (row) => (
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{sourceLabel(row.source)}</span>
      ),
    },
    {
      id: "created",
      header: "Création",
      cellClassName: "whitespace-nowrap text-zinc-600 dark:text-zinc-400",
      cell: (row) => formatDateFr(row.created_at),
    },
    {
      id: "discussion",
      header: "",
      headerClassName: "w-14",
      cellClassName: "w-14",
      cell: (row) => (
        <button
          type="button"
          onClick={() => openConversation(row)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          title="Voir la discussion"
          aria-label={`Voir la discussion — ${dash(row.full_name)}`}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/40 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Nom ou contact
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, téléphone…"
            className="h-9 pl-9"
          />
          <Search className="pointer-events-none relative -mt-8 ml-3 h-4 w-4 text-zinc-400" aria-hidden />
        </div>
        <div className="w-full min-w-[180px] space-y-1.5 lg:w-48">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Source
          </label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SOURCE_ALL}>Toutes les sources</SelectItem>
              <SelectItem value="widget">Widget</SelectItem>
              <SelectItem value="embed">Embed</SelectItem>
              <SelectItem value="dashboard">Dashboard</SelectItem>
              <SelectItem value="api">API</SelectItem>
              <SelectItem value="unknown">Inconnue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-9 gap-2 text-xs lg:shrink-0">
              <CalendarRange className="h-3.5 w-3.5 opacity-70" aria-hidden />
              Période
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Filtrer par date de création
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500">Du</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500">Au</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full text-xs"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Effacer les dates
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-2 text-xs lg:ml-auto"
          onClick={() => {
            setSearch("");
            setSourceFilter(SOURCE_ALL);
            setDateFrom("");
            setDateTo("");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 opacity-70" aria-hidden />
          Réinitialiser
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        emptyLabel="Aucun lead ne correspond aux filtres."
      />
      <ConversationSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setActiveLead(null);
          setSheetError(null);
          setPanel("idle");
        }}
        title="Discussion"
        subtitle={
          activeLead
            ? [dash(activeLead.full_name), dash(activeLead.email)].filter((s) => s !== "—").join(" · ")
            : null
        }
      >
        {panel === "loading" ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Chargement…</p>
        ) : panel === "error" && sheetError ? (
          <p className="rounded-2xl border border-red-900/40 bg-red-950/30 px-4 py-4 text-sm text-red-200">
            {sheetError}
          </p>
        ) : panel === "lead-missing" ? (
          <LeadMissingMessage />
        ) : panel === "no-session" ? (
          <p className="rounded-2xl border border-amber-900/30 bg-amber-950/20 px-4 py-4 text-sm leading-relaxed text-amber-100/90">
            Aucune session de chat n’a été associée à ce contact (leads créés avant la mise à jour ou hors
            formulaire). Les prochains leads incluront l’historique automatiquement.
          </p>
        ) : panel === "empty-thread" ? (
          <EmptyThreadMessage />
        ) : panel === "messages" ? (
          <LeadConversationBubbles messages={messages} />
        ) : null}
      </ConversationSheet>
    </>
  );
}
