import { randomUUID } from "node:crypto";

export interface CapturedProtocolFrame {
  event: string;
  captured_at: string;
  payload: Record<string, unknown>;
}

export interface ProtocolFrameBundleSummary {
  id: string;
  label: string | null;
  frame_count: number;
  created_at: string;
}

export interface ProtocolFrameBundle extends ProtocolFrameBundleSummary {
  frames: CapturedProtocolFrame[];
}

export interface ProtocolFieldByteChange {
  byte_index: number;
  baseline: string;
  comparison: string;
}

export interface ProtocolChangedField {
  field: string;
  byte_changes: ProtocolFieldByteChange[];
}

export interface ProtocolFramePairDiff {
  index: number;
  baseline_event: string | null;
  comparison_event: string | null;
  baseline_payload: Record<string, unknown> | null;
  comparison_payload: Record<string, unknown> | null;
  changed_fields: ProtocolChangedField[];
}

export interface ProtocolBundleComparison {
  baseline_bundle_id: string;
  comparison_bundle_id: string;
  frame_pairs: ProtocolFramePairDiff[];
}

export interface ProtocolWatchSessionSummary {
  id: string;
  label: string | null;
  status: "active" | "stopped";
  frame_count: number;
  created_at: string;
  stopped_at: string | null;
}

export interface ProtocolWatchSession extends ProtocolWatchSessionSummary {
  frames: CapturedProtocolFrame[];
}

export class ProtocolFrameBundleStore {
  private readonly recentFrames: CapturedProtocolFrame[] = [];
  private readonly bundles: ProtocolFrameBundle[] = [];
  private readonly watchSessions: ProtocolWatchSession[] = [];

  constructor(
    private readonly maxRecentFrames = 200,
    private readonly maxBundles = 20,
    private readonly maxWatchSessions = 10
  ) {}

  recordFrame(event: string, payload: Record<string, unknown>): void {
    const frame = {
      event,
      captured_at: new Date().toISOString(),
      payload: structuredClone(payload)
    };
    this.recentFrames.push(frame);

    while (this.recentFrames.length > this.maxRecentFrames) {
      this.recentFrames.shift();
    }

    for (const session of this.watchSessions) {
      if (session.status !== "active") {
        continue;
      }
      session.frames.push(structuredClone(frame));
      session.frame_count = session.frames.length;
    }
  }

  createBundle(label: string | null): ProtocolFrameBundleSummary {
    const bundle: ProtocolFrameBundle = {
      id: randomUUID(),
      label,
      frame_count: this.recentFrames.length,
      created_at: new Date().toISOString(),
      frames: this.recentFrames.map((frame) => structuredClone(frame))
    };

    this.bundles.unshift(bundle);
    while (this.bundles.length > this.maxBundles) {
      this.bundles.pop();
    }

    return this.toSummary(bundle);
  }

  listBundles(): ProtocolFrameBundleSummary[] {
    return this.bundles.map((bundle) => this.toSummary(bundle));
  }

  getBundle(id: string): ProtocolFrameBundle | null {
    const bundle = this.bundles.find((candidate) => candidate.id === id);
    return bundle ? structuredClone(bundle) : null;
  }

  startWatchSession(label: string | null): ProtocolWatchSessionSummary {
    const session: ProtocolWatchSession = {
      id: randomUUID(),
      label,
      status: "active",
      frame_count: 0,
      created_at: new Date().toISOString(),
      stopped_at: null,
      frames: []
    };
    this.watchSessions.unshift(session);
    while (this.watchSessions.length > this.maxWatchSessions) {
      this.watchSessions.pop();
    }
    return this.toWatchSummary(session);
  }

  getWatchSession(id: string): ProtocolWatchSession | null {
    const session = this.watchSessions.find((candidate) => candidate.id === id);
    return session ? structuredClone(session) : null;
  }

  stopWatchSession(id: string): ProtocolWatchSessionSummary | null {
    const session = this.watchSessions.find((candidate) => candidate.id === id);
    if (!session) {
      return null;
    }
    if (session.status === "active") {
      session.status = "stopped";
      session.stopped_at = new Date().toISOString();
    }
    session.frame_count = session.frames.length;
    return this.toWatchSummary(session);
  }

  compareBundles(baselineId: string, comparisonId: string): ProtocolBundleComparison | null {
    const baseline = this.bundles.find((candidate) => candidate.id === baselineId);
    const comparison = this.bundles.find((candidate) => candidate.id === comparisonId);
    if (!baseline || !comparison) {
      return null;
    }

    const length = Math.max(baseline.frames.length, comparison.frames.length);
    const framePairs: ProtocolFramePairDiff[] = [];
    for (let index = 0; index < length; index += 1) {
      const baselineFrame = baseline.frames[index] ?? null;
      const comparisonFrame = comparison.frames[index] ?? null;
      framePairs.push({
        index,
        baseline_event: baselineFrame?.event ?? null,
        comparison_event: comparisonFrame?.event ?? null,
        baseline_payload: baselineFrame?.payload ? structuredClone(baselineFrame.payload) : null,
        comparison_payload: comparisonFrame?.payload ? structuredClone(comparisonFrame.payload) : null,
        changed_fields: compareFramePayloads(baselineFrame?.payload ?? null, comparisonFrame?.payload ?? null)
      });
    }

    return {
      baseline_bundle_id: baselineId,
      comparison_bundle_id: comparisonId,
      frame_pairs: framePairs
    };
  }

  private toSummary(bundle: ProtocolFrameBundle): ProtocolFrameBundleSummary {
    return {
      id: bundle.id,
      label: bundle.label,
      frame_count: bundle.frame_count,
      created_at: bundle.created_at
    };
  }

  private toWatchSummary(session: ProtocolWatchSession): ProtocolWatchSessionSummary {
    return {
      id: session.id,
      label: session.label,
      status: session.status,
      frame_count: session.frame_count,
      created_at: session.created_at,
      stopped_at: session.stopped_at
    };
  }
}

function compareFramePayloads(
  baseline: Record<string, unknown> | null,
  comparison: Record<string, unknown> | null
): ProtocolChangedField[] {
  const changedFields: ProtocolChangedField[] = [];
  for (const field of ["bytes_hex", "payload_hex"] as const) {
    const baselineHex = typeof baseline?.[field] === "string" ? (baseline[field] as string) : null;
    const comparisonHex = typeof comparison?.[field] === "string" ? (comparison[field] as string) : null;
    const byteChanges = diffHexField(baselineHex, comparisonHex);
    if (byteChanges.length > 0) {
      changedFields.push({
        field,
        byte_changes: byteChanges
      });
    }
  }

  return changedFields;
}

function diffHexField(baseline: string | null, comparison: string | null): ProtocolFieldByteChange[] {
  const baselineBytes = splitHexBytes(baseline);
  const comparisonBytes = splitHexBytes(comparison);
  const length = Math.max(baselineBytes.length, comparisonBytes.length);
  const changes: ProtocolFieldByteChange[] = [];

  for (let index = 0; index < length; index += 1) {
    const baselineByte = baselineBytes[index] ?? null;
    const comparisonByte = comparisonBytes[index] ?? null;
    if (baselineByte === comparisonByte) {
      continue;
    }

    changes.push({
      byte_index: index,
      baseline: baselineByte ?? "",
      comparison: comparisonByte ?? ""
    });
  }

  return changes;
}

function splitHexBytes(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const normalized = value.trim().replaceAll(/\s+/g, "").toLowerCase();
  if (normalized.length === 0) {
    return [];
  }

  const bytes: string[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(normalized.slice(index, index + 2));
  }
  return bytes;
}
