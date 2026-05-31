import { notFound } from "next/navigation";
import { ServiceView } from "@/components/views/Launcher";
import { SERVICES } from "@/lib/mock/data";

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const s = SERVICES.find((x) => x.id === service);
  if (!s) notFound();
  return <ServiceView s={s} />;
}
