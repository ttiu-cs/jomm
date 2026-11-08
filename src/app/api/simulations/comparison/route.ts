import { handle } from "@/lib/server/http";
import { runLab } from "@/lib/server/lab";
export const dynamic = "force-dynamic";
export const GET = handle((req: Request) => runLab(new URL(req.url).searchParams));
