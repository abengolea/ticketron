"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ticket, ShieldCheck, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Generador", icon: Ticket },
    { href: "/validate", label: "Validador", icon: ShieldCheck },
    { href: "/history", label: "Historial", icon: History },
  ];

  return (
    <header className="bg-card/80 backdrop-blur-sm border-b sticky top-0 z-50 no-print">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
              <Ticket className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-headline font-bold text-foreground">Ticketron</span>
          </Link>
          <nav>
            <ul className="flex items-center gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Button asChild variant={isActive ? "secondary" : "ghost"}>
                      <Link
                        href={item.href}
                        className={cn("flex items-center gap-2 text-sm font-medium")}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
