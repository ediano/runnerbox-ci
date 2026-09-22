"use client";

const CARDS = [
  {
    id: "github",
    title: "GitHub Actions",
    description: "Self-hosted runner para um repositório ou uma organização.",
  },
  {
    id: "gitlab",
    title: "GitLab CI",
    description: "Executor para escopo de instância, grupo ou projeto.",
  },
];

export default function PlatformCards({ value, onChange, disabled }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CARDS.map((card) => {
        const selected = value === card.id;
        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(card.id)}
            aria-pressed={selected}
            className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-slate-900 bg-white shadow-sm ring-1 ring-slate-900"
                : "border-slate-200 bg-white hover:border-slate-400"
            }`}
          >
            <span className="block font-medium">{card.title}</span>
            <span className="mt-1 block text-sm text-slate-500">{card.description}</span>
          </button>
        );
      })}
    </div>
  );
}
