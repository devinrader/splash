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

export class ProtocolFrameBundleStore {
  private readonly recentFrames: CapturedProtocolFrame[] = [];
  private readonly bundles: ProtocolFrameBundle[] = [];

  constructor(
    private readonly maxRecentFrames = 200,
    private readonly maxBundles = 20
  ) {}

  recordFrame(event: string, payload: Record<string, unknown>): void {
    this.recentFrames.push({
      event,
      captured_at: new Date().toISOString(),
      payload: structuredClone(payload)
    });

    while (this.recentFrames.length > this.maxRecentFrames) {
      this.recentFrames.shift();
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

  private toSummary(bundle: ProtocolFrameBundle): ProtocolFrameBundleSummary {
    return {
      id: bundle.id,
      label: bundle.label,
      frame_count: bundle.frame_count,
      created_at: bundle.created_at
    };
  }
}
