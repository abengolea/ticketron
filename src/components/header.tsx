"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ticket, ShieldCheck, History, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useAuth, useUser } from "@/firebase";
import { GoogleAuthProvider, signInWithRedirect, signOut } from "firebase/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


export function Header() {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, loading } = useUser();

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      // Se cambia a signInWithRedirect para evitar problemas de popup
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Error al iniciar sesión con Google", error);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

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
          <div className="flex items-center gap-4">
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

            <div className="w-px h-6 bg-border" />

            {loading ? null : user ? (
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                       <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'Usuario'} />
                       <AvatarFallback>{user.displayName?.charAt(0) ?? 'U'}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Cerrar sesión</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" onClick={handleLogin}>
                <LogIn className="mr-2 h-4 w-4" />
                Iniciar Sesión
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
