export default function WidgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-full bg-zinc-100 dark:bg-zinc-900">{children}</div>
  );
}
