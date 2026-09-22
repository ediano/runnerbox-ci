export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-900">
          RB
        </span>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Runner Box CI</h1>
          <p className="text-sm text-slate-400">
            Gestão local de runners do GitHub Actions e GitLab CI
          </p>
        </div>
      </div>
    </header>
  );
}
