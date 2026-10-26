import { notFound } from "next/navigation";

// Catch-all for URLs no route claims. Rendering notFound() here, inside the (portal) group, shows the
// themed in-shell 404 (app/(portal)/not-found.tsx). Without it Next serves its stock white page, where
// the portal's light-on-dark body colour is unreadable. A root app/not-found.tsx was tried and
// rejected: it sends `next dev` into a reload loop on /login.
export default function UnknownRoute() {
  notFound();
}
