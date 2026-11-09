import Studio from "./Studio";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <Studio shopId={shopId} />;
}
