"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const tabs = [
  { label: "Emailing", href: "/" },
  { label: "Texting", href: "/mass-texting" },
  { label: "SMS HUB", href: "/sms-hub" },
  { label: "Nearest Voters", href: "/nearest-voters" },
  { label: "Opgov Users", href: "/voters" },
  { label: "Public Speakers", href: "/public_speakers" },
  { label: "Inbound Messages", href: "/inbound-messages" },
];

export function AppBar() {
  const pathname = usePathname();
  const activeTab =
    tabs.find((tab) => pathname === tab.href) ||
    tabs.find((tab) => pathname.startsWith(tab.href) && tab.href !== "/") ||
    tabs[0];
  const active = activeTab.href;

  return (
    <nav className="w-full border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center h-14">
          <div className="hidden gap-1 md:flex">
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

          <div className="w-full md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between px-2 text-sm font-medium"
                >
                  <span className="truncate">{activeTab.label}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[calc(100vw-2rem)] max-w-sm"
              >
                {tabs.map((tab) => (
                  <DropdownMenuItem asChild key={tab.href}>
                    <Link
                      href={tab.href}
                      className={
                        "flex w-full items-center gap-2 " +
                        (active === tab.href
                          ? "text-primary font-medium"
                          : "text-foreground")
                      }
                      aria-current={active === tab.href ? "page" : undefined}
                    >
                      <span>{tab.label}</span>
                      {active === tab.href ? (
                        <Check className="ml-auto h-4 w-4" />
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
