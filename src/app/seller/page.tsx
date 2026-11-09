import { Suspense } from "react";
import { db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
import SellerEntry from "./SellerEntry";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <SellerEntry shops={listShops(db())} />
    </Suspense>
  );
}
