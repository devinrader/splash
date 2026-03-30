export type MessagePayload = Record<string, unknown>;

export type MessageHandler = (payload: MessagePayload) => Promise<void> | void;

export interface MessagingSession {
  publish(subject: string, payload: MessagePayload): Promise<void>;
  subscribe(subject: string, handler: MessageHandler): void;
}
