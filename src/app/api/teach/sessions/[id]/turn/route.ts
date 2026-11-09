import { handle, db, readJson } from "@/lib/server/http";
import { teachTurn } from "@/lib/teach/service";
// One conversational turn: what the owner said + the current camera frame (JPEG data URL, optional).
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const b = await readJson<{ text?: string; image?: string | null }>(req);
  return teachTurn(db(), (await params).id, { text: b.text ?? "", imageDataUrl: b.image ?? null });
});
