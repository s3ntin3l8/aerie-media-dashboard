import { ServiceViewById } from "@/components/views/Launcher";

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ at?: string }>;
}) {
  const { service } = await params;
  const { at } = await searchParams;
  return <ServiceViewById serviceId={service} deepPath={at} />;
}
