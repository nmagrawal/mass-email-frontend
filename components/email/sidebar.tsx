"use client";

import { Inbox, Send, Megaphone, PenSquare, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentFolder: string;
  onFolderChange: (folder: string) => void;
  onCompose: () => void;
  unreadCount?: number;
}

const navItems = [
  // { id: "inbox", label: "Inbox", icon: Inbox },
  // { id: "sent", label: "Sent", icon: Send },
  { id: "mass-campaigns", label: "Mass Campaigns", icon: Megaphone },
];

export function Sidebar({
  currentFolder,
  onFolderChange,
  onCompose,
  unreadCount = 0,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 border-b border-sidebar-border p-4">
        <Mail className="h-6 w-6 text-sidebar-primary" />
        <h1 className="text-lg font-semibold text-sidebar-foreground">Mail</h1>
      </div>

      {/* <div className="p-3">
        <button
          onClick={onCompose}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
        >
          <PenSquare className="h-4 w-4" />
          Compose
        </button>
      </div> */}

      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentFolder === item.id;
          const showBadge = item.id === "inbox" && unreadCount > 0;

          return (
            <button
              key={item.id}
              onClick={() => onFolderChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1 text-left">{item.label}</span>
              {showBadge && (
                <span className="min-w-[1.25rem] rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-primary-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground">
          Connected to FastAPI Backend
        </p>
      </div>
    </aside>
  );
}
