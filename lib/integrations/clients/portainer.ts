// ============================================================
// AERIE — Portainer container control (server-only)
// Powers the admin-only "restart container" action in the Status view. Uses a stored
// Portainer access token (X-API-Key) and the proxied Docker Engine API, so AERIE never
// mounts the Docker socket and gains no host-level control beyond what the token allows.
// All calls THROW on missing config / non-2xx; the data facade & action catch.
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient } from "../serviceClient";

export interface PortainerEndpoint {
  /** Portainer environment (endpoint) id — the {endpointId} in the Docker proxy path. */
  Id: number;
  /** Display name (e.g. "local", or a per-agent node name). */
  Name: string;
}

export interface PortainerContainer {
  /** Docker container id. */
  Id: string;
  /** Docker names, each leading-slash prefixed (e.g. ["/sonarr"]). */
  Names: string[];
  /** "running" | "exited" | "paused" | … */
  State: string;
}

const portainerHeaders = (apiKey: string) => ({ "X-API-Key": apiKey });

/** List the Portainer environments (endpoints). Used to enumerate candidate endpoints when a
 *  service doesn't pin one (multi-agent topologies), and to auto-resolve the single-endpoint case. */
export async function portainerEndpoints(serviceId: string): Promise<PortainerEndpoint[]> {
  const { apiKey, json } = await serviceClient(serviceId);
  const rows = await json<PortainerEndpoint[]>("/api/endpoints", { service: serviceId, headers: portainerHeaders(apiKey) });
  return (rows ?? []).map((e) => ({ Id: e.Id, Name: e.Name }));
}

/** List containers on a Portainer endpoint via the proxied Docker Engine API
 *  (`GET /api/endpoints/{endpointId}/docker/containers/json?all=1`, includes stopped containers).
 *  Used to auto-resolve which endpoint hosts a named container, and to recover the container's
 *  exact (case-sensitive) Docker name for the restart call. */
export async function portainerContainers(serviceId: string, endpointId: string): Promise<PortainerContainer[]> {
  const { apiKey, json } = await serviceClient(serviceId);
  const path = `/api/endpoints/${encodeURIComponent(endpointId)}/docker/containers/json?all=1`;
  const rows = await json<PortainerContainer[]>(path, { service: serviceId, headers: portainerHeaders(apiKey) });
  return (rows ?? []).map((c) => ({ Id: c.Id, Names: c.Names ?? [], State: c.State }));
}

/**
 * Restart a container on a Portainer endpoint via the proxied Docker Engine API
 * (`POST /api/endpoints/{endpointId}/docker/containers/{name}/restart`). The Docker API accepts a
 * container **name** as well as an id, so we pass the stable name straight through — never a
 * volatile container id. Fire-and-forget: Docker returns 204 with an empty body on success.
 */
export async function portainerRestartContainer(serviceId: string, endpointId: string, containerName: string): Promise<void> {
  const { apiKey, raw } = await serviceClient(serviceId);
  const path = `/api/endpoints/${encodeURIComponent(endpointId)}/docker/containers/${encodeURIComponent(containerName)}/restart`;
  const res = await raw(path, { service: serviceId, method: "POST", headers: portainerHeaders(apiKey), timeoutMs: 10_000 });
  if (!res.ok) throw new IntegrationError(serviceId, `container restart failed: HTTP ${res.status} for ${containerName}`, res.status);
}
