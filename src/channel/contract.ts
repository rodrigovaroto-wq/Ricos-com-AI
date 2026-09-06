/**
 * The channel contract. Everything the agent knows about WhatsApp lives behind this
 * interface, and the simulated adapter speaks exactly the same shape as the WAHA one.
 * That is what lets the whole system be built and tested before a number exists:
 * swapping the simulator for the real channel is a swap of adapter, not a rewrite.
 */
export interface InboundMessage {
  /** Channel-side id. Used for idempotency: the same event never becomes two turns. */
  externalId: string;
  from: string;
  body: string;
  media?: { kind: "audio" | "image" | "document"; url: string };
  /** Ad attribution from a Click-to-WhatsApp entry, when present. */
  ad?: { ctwaClid: string; sourceId?: string; sourceType?: string };
  receivedAt: Date;
}

export interface OutboundMessage {
  to: string;
  body: string;
  media?: { kind: "audio" | "image" | "video"; url: string };
}

export interface Channel {
  send: (message: OutboundMessage) => Promise<{ externalId: string }>;
  /** Keeps the "typing" indicator alive; expires in ~20s on WhatsApp. */
  setTyping: (to: string, on: boolean) => Promise<void>;
}
