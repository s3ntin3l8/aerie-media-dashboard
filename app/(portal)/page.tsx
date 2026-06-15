import { Home } from "@/components/views/Home";

// The modular homescreen seeds itself from the per-user dashboards store, which the
// portal layout fetches once and exposes via PortalProvider (so the mobile dashboard
// shares the same seed). Home reads it from usePortal().
export default function HomePage() {
  return <Home />;
}
