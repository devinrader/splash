import { randomUUID } from "node:crypto";

export type ProtocolAnnotationConfidence = "known" | "inferred" | "unknown";

export interface ProtocolAnnotationInput {
  bundle_id: string;
  frame_index: number;
  field_name: string;
  byte_start: number;
  byte_end: number;
  confidence: ProtocolAnnotationConfidence;
  label: string;
  notes: string | null;
}

export interface ProtocolAnnotation extends ProtocolAnnotationInput {
  id: string;
  created_at: string;
}

export class ProtocolAnnotationStore {
  private readonly annotations: ProtocolAnnotation[] = [];

  create(input: ProtocolAnnotationInput): ProtocolAnnotation {
    const annotation: ProtocolAnnotation = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...structuredClone(input)
    };
    this.annotations.unshift(annotation);
    return structuredClone(annotation);
  }

  list(bundleId: string | null = null): ProtocolAnnotation[] {
    const filtered = bundleId
      ? this.annotations.filter((annotation) => annotation.bundle_id === bundleId)
      : this.annotations;
    return filtered.map((annotation) => structuredClone(annotation));
  }
}
