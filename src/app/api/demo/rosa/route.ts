import { handle, db } from "@/lib/server/http";
import { setupRosa } from "@/lib/demo/setup";
// Plays Rosa's scripted walk-through through the real teaching pipeline and (re)stocks her stall.
export const POST = handle(async () => setupRosa(db()));
