import { handle, db } from "@/lib/server/http";
import { publishSession } from "@/lib/teach/service";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => publishSession(db(), (await params).id));
