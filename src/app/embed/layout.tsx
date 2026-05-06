export default function EmbedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      data-embed-root="true"
    >
      {children}
    </div>
  );
}
