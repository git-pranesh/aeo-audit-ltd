import { Link } from "wouter";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell>
      <div className="text-center space-y-4 py-16">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <Link href="/"><Button variant="outline">Go home</Button></Link>
      </div>
    </AppShell>
  );
}
