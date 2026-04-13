import { DashboardShell } from "./dashboard-shell";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-col">
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
