import { ServiceViewById } from "@/components/views/Launcher";

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  return <ServiceViewById serviceId={service} />;
}
