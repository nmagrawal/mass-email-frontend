"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Emailing", href: "/" },
  { label: "Texting", href: "/mass-texting" },
  { label: "Opgov Users", href: "/voters" },
  { label: "Public Speakers", href: "/public_speakers" },
  { label: "Inbound Messages", href: "/inbound-messages" },
];

export function AppBar() {
  const pathname = usePathname();
  const active =
    tabs.find((tab) => pathname === tab.href)?.href ||
    tabs.find((tab) => pathname.startsWith(tab.href) && tab.href !== "/")
      ?.href ||
    "/";
  return (
    <nav className="w-full border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center h-14">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "px-4 py-2 rounded-t-md font-medium text-sm transition-colors " +
                  (active === tab.href
                    ? "bg-background border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
                aria-current={active === tab.href ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
