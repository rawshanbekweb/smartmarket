import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../middleware/common';
import { AppError, unauthorized } from '../lib/errors';
import { realAdapters } from '../integrations/payments/adapters';
import { applyProviderEvent } from '../services/payment.service';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';

/**
 * Payment provider webhooks. Flow: adapter enabled? → verify signature →
 * parse → applyProviderEvent (idempotent by provider+providerTxnId).
 * All real adapters are currently disabled, so this returns 503.
 */
export const webhooksRouter = Router();

webhooksRouter.post(
  '/payments/:provider',
  ah(async (req, res) => {
    const provider = z.enum(['payme', 'click', 'uzum']).parse(req.params.provider).toUpperCase() as 'PAYME' | 'CLICK' | 'UZUM';
    const adapter = realAdapters[provider];
    if (!adapter.isEnabled()) {
      throw new AppError(503, 'PROVIDER_NOT_INTEGRATED', `${provider} integratsiyasi hali ulanmagan`);
    }
    if (!(await adapter.verifyWebhook(req))) {
      await audit(prisma, { actor: null, req, action: 'WEBHOOK_SIGNATURE_INVALID', entityType: 'Payment', summary: provider });
      throw unauthorized('Invalid signature');
    }
    const event = await adapter.parseWebhook(req);
    const r = await applyProviderEvent(provider, event, false);
    res.json({ ok: true, idempotent: r.idempotent });
  }),
);
