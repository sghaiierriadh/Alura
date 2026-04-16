"use client";

import { setTicketPriority, type TicketPriorityValue } from "@/app/actions/admin-tickets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

type Props = {
  complaintId: string;
  priority: string | null | undefined;
};

function coercePriority(p: string | null | undefined): TicketPriorityValue {
  const v = (p ?? "normal").trim().toLowerCase();
  if (v === "low") return "low";
  if (v === "high") return "high";
  return "normal";
}

function labelFor(p: TicketPriorityValue) {
  if (p === "low") return "Basse";
  if (p === "high") return "Haute";
  return "Moyenne";
}

function dotClass(p: TicketPriorityValue) {
  if (p === "low") return "bg-sky-500";
  if (p === "high") return "bg-red-500";
  return "bg-orange-500";
}

export function TicketPrioritySelect({ complaintId, priority }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = coercePriority(priority);

  return (
    <Select
      disabled={pending}
      value={value}
      onValueChange={(next) => {
        const v = next as TicketPriorityValue;
        if (v === value) return;
        startTransition(async () => {
          const r = await setTicketPriority(complaintId, v);
          if (r.ok) {
            toast.success("Priorité mise à jour");
            router.refresh();
          } else {
            toast.error(r.error);
            router.refresh();
          }
        });
      }}
    >
      <SelectTrigger aria-label="Priorité du ticket" className="h-9 w-[10.5rem] gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(value)}`} aria-hidden />
        <SelectValue placeholder={labelFor(value)} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="low" className="border-l-[3px] border-sky-500 pl-3">
          Basse
        </SelectItem>
        <SelectItem value="normal" className="border-l-[3px] border-orange-500 pl-3">
          Moyenne
        </SelectItem>
        <SelectItem value="high" className="border-l-[3px] border-red-500 pl-3">
          Haute
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
