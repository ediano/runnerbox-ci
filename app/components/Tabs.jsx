"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Runners" },
  { href: "/usage", label: "Resource usage" },
];

export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-slate-100 text-slate-100"
                : "border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
