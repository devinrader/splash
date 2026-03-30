export interface EventSink {
  publish(event: string, payload: Record<string, unknown>): void;
}

interface EventClient {
  send(event: string, payload: Record<string, unknown>): void;
}

export class EventBroker implements EventSink {
  private readonly clients = new Set<EventClient>();

  addClient(client: EventClient): () => void {
    this.clients.add(client);
    return () => {
      this.clients.delete(client);
    };
  }

  publish(event: string, payload: Record<string, unknown>): void {
    for (const client of this.clients) {
      client.send(event, payload);
    }
  }
}
