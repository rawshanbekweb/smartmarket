import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { ElectronicMethod, Invoice, InvoiceRequest, PaymentProviderAdapter, ProviderEvent } from './PaymentProvider';

/**
 * Real provider adapters (Payme, Click, Uzum) — FUTURE INTEGRATION.
 *
 * They are intentionally disabled. Enabling one requires:
 *   1. a signed merchant agreement and credentials (env vars),
 *   2. implementing the provider's official protocol
 *      (Payme: JSON-RPC Merchant API with Basic auth; Click: SHOP API prepare/complete
 *       with MD5 sign_string; Uzum: provider-specified checkout/webhook spec),
 *   3. signature verification + replay protection,
 *   4. end-to-end tests in the provider sandbox.
 * Until then the webhook endpoint answers 503 and no payment can be marked paid by them.
 */
abstract class NotIntegratedAdapter implements PaymentProviderAdapter {
  abstract readonly method: ElectronicMethod;
  protected abstract hasCredentials(): boolean;

  isEnabled() {
    // Credentials alone are not enough: the protocol implementation is pending.
    return false;
  }

  credentialsConfigured() {
    return this.hasCredentials();
  }

  private notReady(): never {
    throw new AppError(503, 'PROVIDER_NOT_INTEGRATED', `${this.method} integratsiyasi hali ulanmagan (rejalashtirilgan).`);
  }

  async createInvoice(_req: InvoiceRequest): Promise<Invoice> {
    this.notReady();
  }
  async verifyWebhook(_req: Request): Promise<boolean> {
    return false;
  }
  async parseWebhook(_req: Request): Promise<ProviderEvent> {
    this.notReady();
  }
}

export class PaymeAdapter extends NotIntegratedAdapter {
  readonly method = 'PAYME' as const;
  protected hasCredentials() {
    return !!(env.PAYME_MERCHANT_ID && env.PAYME_SECRET_KEY);
  }
}

export class ClickAdapter extends NotIntegratedAdapter {
  readonly method = 'CLICK' as const;
  protected hasCredentials() {
    return !!(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY);
  }
}

export class UzumAdapter extends NotIntegratedAdapter {
  readonly method = 'UZUM' as const;
  protected hasCredentials() {
    return !!(env.UZUM_MERCHANT_ID && env.UZUM_SECRET_KEY);
  }
}

/**
 * DEMO simulator — clearly marked, available only when DEMO_MODE=true.
 * It exercises the same invoice → callback → idempotent confirmation path as a real provider.
 */
export class DemoSimulatorAdapter {
  constructor(public readonly method: ElectronicMethod) {}

  async createInvoice(_req: InvoiceRequest): Promise<Invoice> {
    return { providerTxnId: `DEMO-${this.method}-${randomUUID()}`, checkoutUrl: null, simulated: true };
  }
}

export const realAdapters: Record<ElectronicMethod, NotIntegratedAdapter> = {
  PAYME: new PaymeAdapter(),
  CLICK: new ClickAdapter(),
  UZUM: new UzumAdapter(),
};

export function providerStatusList() {
  return (Object.keys(realAdapters) as ElectronicMethod[]).map((m) => ({
    method: m,
    integrated: realAdapters[m].isEnabled(),
    credentialsConfigured: realAdapters[m].credentialsConfigured(),
    simulatorAvailable: env.DEMO_MODE,
  }));
}
