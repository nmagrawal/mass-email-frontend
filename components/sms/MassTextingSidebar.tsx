import React from "react";

export interface MassTextingSidebarProps {
  tab: string;
  setTab: (tab: string) => void;
}

const TABS = [
  { key: "modern", label: "Modern Mass Texting" },
  { key: "classic", label: "Classic Mass Texting" },
];

export function MassTextingSidebar({ tab, setTab }: MassTextingSidebarProps) {
  return (
    <aside className="flex h-full w-56 flex-col border-r bg-gray-50">
      <div className="flex items-center gap-2 border-b p-4">
        <span className="text-lg font-semibold">Texting</span>
      </div>
      <nav className="flex-1 flex flex-col gap-2 p-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`text-left px-3 py-2 rounded transition font-medium ${tab === t.key ? "bg-blue-600 text-white" : "hover:bg-blue-100"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
