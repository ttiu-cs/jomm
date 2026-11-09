import { handle, db, readJson } from "@/lib/server/http";
import { deleteDraft, updateDraft } from "@/lib/teach/service";
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => updateDraft(db(), (await params).id, await readJson(req)));
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => deleteDraft(db(), (await params).id));
