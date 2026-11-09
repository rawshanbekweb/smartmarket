import type { PaymentMethod } from '@prisma/client';
import type { Request } from 'express';

export type ElectronicMethod = Exclude<PaymentMethod, 'CASH'>;

export interface InvoiceRequest {
  paymentId: string;
  amount: number; // UZS
  description: string;
}

export interface Invoice {
  providerTxnId: string;
  /** Checkout URL for the seller. null for the simulator. */
  checkoutUrl: string | null;
  simulated: boolean;
}

/** Normalised provider callback after signature verification. */
export interface ProviderEvent {
  providerTxnId: string;
  paymentId: string;
  outcome: 'SUCCESS' | 'FAILED' | 'PENDING_SYNC';
  amount: number;
  raw: Record<string, unknown>; // sanitised subset only
}

export interface PaymentProviderAdapter {
  readonly method: ElectronicMethod;
  /** True only when merchant credentials are configured AND the adapter is implemented & tested. */
  isEnabled(): boolean;
  createInvoice(req: InvoiceRequest): Promise<Invoice>;
  /** Verify signature/auth of an incoming webhook. Must be constant-time where applicable. */
  verifyWebhook(req: Request): Promise<boolean>;
  parseWebhook(req: Request): Promise<ProviderEvent>;
}
