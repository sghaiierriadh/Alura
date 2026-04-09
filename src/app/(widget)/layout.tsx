export default function WidgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="m-0 box-border flex h-dvh max-h-dvh w-full flex-col overflow-hidden p-0">
      {children}
    </div>
  );
}
