import { notFound } from "next/navigation";
import { ServiceView } from "@/components/views/Launcher";
import { getSnapshot } from "@/lib/data/snapshot";

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const { services } = await getSnapshot();
  const s = services.find((x) => x.id === service);
  if (!s) notFound();
  return <ServiceView s={s} />;
}
