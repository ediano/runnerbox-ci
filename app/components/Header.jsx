import Tabs from "./Tabs";

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto w-full max-w-7xl px-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-900">
            RB
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Runner Box CI</h1>
            <p className="text-sm text-slate-400">
              Local management for GitHub Actions and GitLab CI runners
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Tabs />
        </div>
      </div>
    </header>
  );
}
