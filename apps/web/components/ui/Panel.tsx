export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-line p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
