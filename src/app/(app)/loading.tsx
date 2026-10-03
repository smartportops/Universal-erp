export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-7 w-48 rounded-md bg-[#ececf0]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((key) => <div key={key} className="h-[92px] rounded-xl bg-surface shadow-[var(--shadow)]" />)}
      </div>
      <div className="mt-5 h-72 rounded-xl bg-surface shadow-[var(--shadow)]" />
    </div>
  );
}
