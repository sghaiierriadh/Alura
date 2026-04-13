"use client";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
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
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

const FILTER_ALL = "all";

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

function excerpt(text: string, max = 96) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function priorityLabel(p: string | null | undefined) {
  const v = (p ?? "normal").trim().toLowerCase();
  if (v === "high") return "Haute";
  if (v === "low") return "Basse";
  if (v === "medium") return "Moyenne";
  return "Normale";
}

function priorityBadgeClass(p: string | null | undefined) {
  const v = (p ?? "normal").trim().toLowerCase();
  if (v === "high") {
    return "bg-red-500/15 text-red-900 ring-red-500/30 dark:text-red-100 dark:ring-red-400/40";
  }
  if (v === "low") {
    return "bg-sky-500/15 text-sky-900 ring-sky-500/30 dark:text-sky-100 dark:ring-sky-400/35";
  }
  /* normal, medium, ou valeur inconnue : traité comme priorité « moyenne » (orange) */
  return "bg-orange-500/15 text-orange-950 ring-orange-500/30 dark:text-orange-100 dark:ring-orange-400/35";
}

export function TicketsTableClient({ tickets }: { tickets: TicketWithLead[] }) {
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [priorityFilter, setPriorityFilter] = useState(FILTER_ALL);
  const [search, setSearch] = useState("");

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

  const columns: DataTableColumn<TicketWithLead>[] = [
    {
      id: "date",
      header: "Date",
      cellClassName: "whitespace-nowrap text-zinc-600 dark:text-zinc-400",
      cell: (row) => formatDateFr(row.created_at),
    },
    {
      id: "contact",
      header: "Contact",
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
      cell: (row) => (
        <p className="max-w-md text-zinc-700 dark:text-zinc-300" title={row.content}>
          {excerpt(row.content)}
        </p>
      ),
    },
    {
      id: "priority",
      header: "Priorité",
      headerClassName: "w-28",
      cell: (row) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${priorityBadgeClass(row.priority)}`}
        >
          {priorityLabel(row.priority)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      headerClassName: "min-w-[12rem]",
      cell: (row) => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <TicketStatusEditor
            key={`${row.id}-${row.status}-${(row.resolution_notes ?? "").slice(0, 24)}`}
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
            className="h-9"
          />
        </div>
        <div className="w-full min-w-[160px] space-y-1.5 sm:w-44">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Statut
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9">
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
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Toutes</SelectItem>
              <SelectItem value="low">Basse</SelectItem>
              <SelectItem value="normal">Normale</SelectItem>
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
        rows={filtered}
        getRowKey={(r) => r.id}
        emptyLabel="Aucun ticket ne correspond aux filtres."
      />
    </div>
  );
}
