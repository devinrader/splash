export interface DecodedProtocolFrame {
  protocolName: string;
  frameFamily?: string;
  messageType: string;
  actionCode: string;
  sourceAddress: string;
  destinationAddress: string;
  checksumStatus: "valid" | "unknown";
  fields: Record<string, unknown>;
  unknownFields: string[];
  normalizedEvents?: NormalizedEvent[];
}

export interface NormalizedEvent {
  subject: string;
  payload: Record<string, unknown>;
}

export class ProtocolDecodeError extends Error {
  constructor(
    message: string,
    readonly errorCode: string
  ) {
    super(message);
  }
}
