import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { checks, integrationStatus } from "@/lib/integrations/status";
import type { IntegrationStatus } from "@/lib/integrations/types";

const BADGE: Record<IntegrationStatus["state"], { label: string; variant: "default" | "outline" | "destructive" }> = {
  ok: { label: "ready", variant: "default" },
  off: { label: "off", variant: "outline" },
  error: { label: "error", variant: "destructive" },
};

async function StatusGrid() {
  await connection(); // probe live on every request, never at build time
  const rows = await integrationStatus();
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Card size="sm" className="h-full">
            <CardHeader>
              <CardTitle>{row.name}</CardTitle>
              <CardAction>
                <Badge variant={BADGE[row.state].variant}>{BADGE[row.state].label}</Badge>
              </CardAction>
              <CardDescription className="break-words font-mono text-xs">{row.detail}</CardDescription>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function StatusGridSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Checking integrations">
      {checks.map(({ id }) => (
        <li key={id}>
          <Skeleton className="h-[74px] rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">pipeline_shell</h1>
        <p className="text-sm text-muted-foreground">
          Checked on every request. Each integration is optional, and &quot;off&quot; means it
          isn&apos;t configured. Nothing depends on it. The same data is JSON at{" "}
          <a className="underline underline-offset-4" href="/api/integrations">
            /api/integrations
          </a>
          , and setup lives in <code className="font-mono">docs/integrations.md</code>.
        </p>
      </header>
      <Suspense fallback={<StatusGridSkeleton />}>
        <StatusGrid />
      </Suspense>
    </main>
  );
}
