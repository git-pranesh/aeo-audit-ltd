import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { HelpCircle, LayoutDashboard, LogOut, Settings, Shield } from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/auth-service";

export default function AppShell({ children }: { children: ReactNode }) {
  const { me, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();

  const nav = [
    { href: "/dashboard", label: "Audits", icon: LayoutDashboard },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/help", label: "Help", icon: HelpCircle },
    ...(me?.isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href={isAuthenticated ? "/dashboard" : "/"}>
            <img src={logo} alt="Citation Rocket" className="h-10 cursor-pointer" />
          </Link>
          {isAuthenticated && (
            <nav className="flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button variant={location.startsWith(href) ? "secondary" : "ghost"} size="sm" className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Button>
                </Link>
              ))}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                onClick={async () => {
                  await authService.signOut();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

/** Centered spinner used while auth/account state loads. */
export function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
