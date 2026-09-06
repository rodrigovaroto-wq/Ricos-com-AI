import type { Channel, InboundMessage, OutboundMessage } from "./contract.js";

/**
 * The channel used until a WhatsApp number exists. It records what would have been
 * sent so a persona run can assert on it, and it fabricates inbound messages the same
 * way the real webhook would deliver them.
 */
export class SimulatedChannel implements Channel {
  readonly sent: OutboundMessage[] = [];
  readonly typing: Array<{ to: string; on: boolean; at: Date }> = [];
  private seq = 0;

  async send(message: OutboundMessage): Promise<{ externalId: string }> {
    this.sent.push(message);
    return { externalId: `sim-${++this.seq}` };
  }

  async setTyping(to: string, on: boolean): Promise<void> {
    this.typing.push({ to, on, at: new Date() });
  }

  /** Builds an inbound event exactly as the webhook would hand it over. */
  inbound(from: string, body: string, at = new Date()): InboundMessage {
    return { externalId: `sim-in-${++this.seq}`, from, body, receivedAt: at };
  }

  get lastSent(): OutboundMessage | undefined {
    return this.sent[this.sent.length - 1];
  }
}
