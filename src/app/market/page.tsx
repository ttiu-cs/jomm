import BuyerAgent from "./BuyerAgent";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; shop?: string; auto?: string }> }) {
  const sp = await searchParams;
  return <BuyerAgent initialRequest={sp.q} shopId={sp.shop} auto={sp.auto === "1"} />;
}
