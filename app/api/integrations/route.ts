import { connection } from "next/server";
import { integrationStatus } from "@/lib/integrations/status";

// Node.js runtime is the default (segment configs like `runtime` are rejected under cacheComponents).
export async function GET() {
  await connection(); // probe live on every request, never at build time
  return Response.json(await integrationStatus());
}
