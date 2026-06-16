import type { ActivePlatformRequest } from "./viewUtils";

export const ACTIVE_PLATFORM_REQUEST_MAX_COUNT = 50;
export const ACTIVE_PLATFORM_REQUEST_MAX_AGE_MS = 15 * 60 * 1000;

export function appendActivePlatformRequest(
  current: ActivePlatformRequest[],
  request: Omit<ActivePlatformRequest, "requestedAt">,
  nowIso = new Date().toISOString()
): ActivePlatformRequest[] {
  const nextRequest: ActivePlatformRequest = {
    ...request,
    requestedAt: nowIso
  };
  const nextTime = Date.parse(nowIso);
  const thresholdMs = Number.isNaN(nextTime) ? Number.NaN : nextTime - ACTIVE_PLATFORM_REQUEST_MAX_AGE_MS;

  const pruned = current
    .filter((entry) => entry.commandId !== request.commandId)
    .filter((entry) => {
      const requestedAtMs = Date.parse(entry.requestedAt);
      if (Number.isNaN(thresholdMs) || Number.isNaN(requestedAtMs)) {
        return true;
      }
      return requestedAtMs >= thresholdMs;
    });

  return [...pruned, nextRequest].slice(-ACTIVE_PLATFORM_REQUEST_MAX_COUNT);
}
