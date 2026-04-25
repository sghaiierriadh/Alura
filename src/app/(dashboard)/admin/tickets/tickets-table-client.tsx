"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { TicketDetailSheet } from "@/components/admin/ticket-detail-sheet";
import { TicketPrioritySelect } from "@/components/admin/ticket-priority-select";
import { TicketStatusEditor } from "@/components/admin/ticket-status-editor";
import type { TicketWithLead } from "@/lib/admin/dashboard-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, Eye, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

const FILTER_ALL = "all";
type SortField = "date" | "priority" | "status";
type SortDir = "asc" | "desc";

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

function getLastMessageSnippet(content: string): string {
  const chunks = content
    .split(/\[Update\s+[^\]]+\]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return (chunks[chunks.length - 1] ?? content).trim();
}

function priorityRank(priority: string | null | undefined): number {
  const p = (priority ?? "normal").toLowerCase();
  if (p === "high") return 3;
  if (p === "normal") return 2;
  return 1;
}

function statusRank(status: string | null | undefined): number {
  const s = (status ?? "open").toLowerCase();
  if (s === "resolved") return 3;
  if (s === "in_progress") return 2;
  return 1;
}

export function TicketsTableClient({ tickets }: { tickets: TicketWithLead[] }) {
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [priorityFilter, setPriorityFilter] = useState(FILTER_ALL);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeTicket, setActiveTicket] = useState<TicketWithLead | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== FILTER_ALL && (t.status || "open") !== statusFilter) return false;
      const pr = ((t.priority ?? "normal").trim() || "normal").toLowerCase();
      if (priorityFilter !== FILTER_ALL && pr !== priorityFilter) return false;
      if (q.length > 0) {
        const blob = [
          t.content,
          t.leads?.full_name,
          t.leads?.email,
          t.leads?.phone,
          t.resolution_notes,
        ]
          .map((x) => (x ?? "").toLowerCase())
          .join(" ");
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortField === "date") {
        const av = new Date(a.created_at).getTime();
        const bv = new Date(b.created_at).getTime();
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (sortField === "priority") {
        const av = priorityRank(a.priority);
        const bv = priorityRank(b.priority);
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = statusRank(a.status);
      const bv = statusRank(b.status);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "date" ? "desc" : "asc");
  }

  const columns: DataTableColumn<TicketWithLead>[] = [
    {
      id: "date",
      header: (
        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("date")}>
          Date
          <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      ),
      headerClassName: "w-[140px]",
      cellClassName: "whitespace-nowrap text-zinc-600 dark:text-zinc-400",
      cell: (row) => formatDateFr(row.created_at),
    },
    {
      id: "contact",
      header: "Contact",
      headerClassName: "w-[220px]",
      cell: (row) => (
        <div className="max-w-[200px]">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{dash(row.leads?.full_name)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{dash(row.leads?.email)}</p>
        </div>
      ),
    },
    {
      id: "content",
      header: "Contenu",
      headerClassName: "w-[280px]",
      cell: (row) => (
        <div className="max-w-md">
          <p className="line-clamp-2 font-medium text-zinc-800 dark:text-zinc-100" title={getLastMessageSnippet(row.content)}>
            {getLastMessageSnippet(row.content)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Dernier message reçu</p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Détails",
      headerClassName: "w-[7rem]",
      cellClassName: "w-[7rem]",
      cell: (row) => (
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => setActiveTicket(row)}
          aria-label="Ouvrir les détails du ticket"
        >
          <Eye className="h-3.5 w-3.5 opacity-80" aria-hidden />
          Détails
        </Button>
      ),
    },
    {
      id: "priority",
      header: (
        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("priority")}>
          Priorité
          <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      ),
      headerClassName: "w-[180px]",
      cell: (row) => (
        <div>
          <TicketPrioritySelect complaintId={row.id} priority={row.priority} />
        </div>
      ),
    },
    {
      id: "status",
      header: (
        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
          Statut
          <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      ),
      headerClassName: "w-[220px]",
      cell: (row) => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <TicketStatusEditor
            key={row.id}
            complaintId={row.id}
            initialStatus={row.status || "open"}
            initialResolutionNotes={row.resolution_notes}
          />
          {row.status === "resolved" && (row.resolution_notes?.trim()?.length ?? 0) > 0 ? (
            <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95">
              Documenté
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/40 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Recherche
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Contenu, contact, note…"
            className="h-9 pl-9"
          />
          <Search className="pointer-events-none relative -mt-8 ml-3 h-4 w-4 text-zinc-400" aria-hidden />
        </div>
        <div className="w-full min-w-[160px] space-y-1.5 sm:w-44">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Statut
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Tous les statuts</SelectItem>
              <SelectItem value="open">Ouvert</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="resolved">Résolu</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full min-w-[160px] space-y-1.5 sm:w-44">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Priorité
          </label>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Toutes</SelectItem>
              <SelectItem value="low">Basse</SelectItem>
              <SelectItem value="normal">Moyenne</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 gap-2 text-xs"
          onClick={() => {
            setStatusFilter(FILTER_ALL);
            setPriorityFilter(FILTER_ALL);
            setSearch("");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 opacity-70" aria-hidden />
          Réinitialiser
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={sorted}
        getRowKey={(r) => r.id}
        emptyLabel="Aucun ticket ne correspond aux filtres."
      />

      <TicketDetailSheet
        ticket={activeTicket}
        open={activeTicket !== null}
        onClose={() => setActiveTicket(null)}
      />
    </div>
  );
}
