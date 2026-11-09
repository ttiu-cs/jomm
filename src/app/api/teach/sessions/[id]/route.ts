import { handle, db } from "@/lib/server/http";
import { getSession } from "@/lib/teach/service";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => getSession(db(), (await params).id));
