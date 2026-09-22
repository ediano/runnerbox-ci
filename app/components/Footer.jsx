const REPO_URL = "https://github.com/ediano/runnerbox-ci";
const AUTHOR_URL = "https://github.com/ediano";

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 text-sm text-slate-400">
        <p>
          <strong className="font-medium text-slate-200">RunnerBox CI</strong> — built by{" "}
          <FooterLink href={AUTHOR_URL}>Ediano Silva Santos</FooterLink>. Source on{" "}
          <FooterLink href={REPO_URL}>GitHub</FooterLink>.
        </p>
        <p className="mt-1">
          Local use only: this panel has no authentication and controls the host Docker daemon.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-slate-200 underline decoration-slate-600 underline-offset-2 transition hover:text-white hover:decoration-slate-300"
    >
      {children}
    </a>
  );
}
