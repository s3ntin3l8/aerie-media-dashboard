import { redirect } from "next/navigation";

// /services is now /status (merged browse + launch + health view).
// Keep this redirect so old bookmarks and back-buttons still work.
export default function ServicesPage() {
  redirect("/status");
}
