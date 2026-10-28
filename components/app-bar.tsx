"use client";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
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
import { canAccess, isAdminMetadata } from "@/lib/access";

const tabs = [
  { label: "Emailing", href: "/" },
  { label: "Texting", href: "/mass-texting" },
  { label: "SMS HUB", href: "/sms-hub" },
  { label: "Volunteer Texting", href: "/volunteer-texting" },
  { label: "Nearest Voters", href: "/nearest-voters" },
  { label: "Explore Voters", href: "/explore-voters" },
  { label: "Opgov Users", href: "/voters" },
  { label: "Public Speakers", href: "/public_speakers" },
  { label: "Inbound Messages", href: "/inbound-messages" },
  { label: "Paper Distribution", href: "/paper-distribution" },
];

export function AppBar() {
  const pathname = usePathname();
  const { isLoaded, user } = useUser();

  // proxy.ts enforces access; this only hides tabs the user can't open.
  const isAdmin = isAdminMetadata(user?.publicMetadata);
  const visibleTabs =
    isLoaded && user ? tabs.filter((tab) => canAccess(tab.href, isAdmin)) : [];

  const activeTab =
    visibleTabs.find((tab) => pathname === tab.href) ||
    visibleTabs.find((tab) => pathname.startsWith(tab.href) && tab.href !== "/") ||
    visibleTabs[0];
  const active = activeTab?.href;

  return (
    <nav className="w-full border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center h-14 gap-2">
          <div className="hidden flex-1 gap-1 md:flex">
            {visibleTabs.map((tab) => (
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

          <div className="flex-1 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between px-2 text-sm font-medium"
                >
                  <span className="truncate">{activeTab?.label ?? "Menu"}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[calc(100vw-2rem)] max-w-sm"
              >
                {visibleTabs.map((tab) => (
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

          <div className="ml-auto flex items-center gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button size="sm" variant="outline">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">Sign up</Button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </div>
    </nav>
  );
}
