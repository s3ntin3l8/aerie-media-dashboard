// Live streams — desktop renders a full-width now-playing panel;
// on mobile, MobilePortal intercepts this pathname and renders MobileStreams.
export const dynamic = "force-dynamic";

import { Streams } from "@/components/views/Streams";

export default function StreamsPage() {
  return <Streams />;
}
