import { randomUUID } from "node:crypto";

export type ProtocolPromptInputType =
  | "controller_menu_state"
  | "equipment_behavior"
  | "circuit_name"
  | "configured_rpm";

export type ProtocolPromptStatus = "open" | "answered";

export interface ProtocolPromptInput {
  bundle_id: string;
  frame_index: number;
  field_name: string | null;
  prompt: string;
  why: string;
  input_type: ProtocolPromptInputType;
  operator_response: string | null;
}

export interface ProtocolPrompt extends ProtocolPromptInput {
  id: string;
  status: ProtocolPromptStatus;
  created_at: string;
  resolved_at: string | null;
}

export class ProtocolPromptStore {
  private readonly prompts: ProtocolPrompt[] = [];

  create(input: ProtocolPromptInput): ProtocolPrompt {
    const resolvedAt = input.operator_response ? new Date().toISOString() : null;
    const prompt: ProtocolPrompt = {
      id: randomUUID(),
      status: input.operator_response ? "answered" : "open",
      created_at: new Date().toISOString(),
      resolved_at: resolvedAt,
      ...structuredClone(input)
    };
    this.prompts.unshift(prompt);
    return structuredClone(prompt);
  }

  list(bundleId: string | null = null): ProtocolPrompt[] {
    const filtered = bundleId
      ? this.prompts.filter((prompt) => prompt.bundle_id === bundleId)
      : this.prompts;
    return filtered.map((prompt) => structuredClone(prompt));
  }
}
