/**
 * Accounting-sync abstraction (QuickBooks/Xero later; stub now).
 *
 * The interface is intentionally tiny: push an invoice, push a payment,
 * get back an external id we persist on the row (`externalSyncId`). Real
 * OAuth-backed providers are a drop-in (TODO-FUTURE); the stub records a
 * deterministic pseudo-id so the sync path is exercised end-to-end.
 */

export type SyncInvoice = {
  id: string;
  invoiceNumber: number;
  companyName: string;
  total: number;
  taxAmount: number;
  dueDate: string | null;
};

export type SyncPayment = {
  id: string;
  invoiceExternalId: string;
  amount: number;
  paidAt: string;
};

export interface AccountingProvider {
  readonly name: string;
  pushInvoice(invoice: SyncInvoice): Promise<{ externalId: string }>;
  pushPayment(payment: SyncPayment): Promise<{ externalId: string }>;
}

class StubAccountingProvider implements AccountingProvider {
  readonly name = "stub";

  async pushInvoice(invoice: SyncInvoice) {
    console.log(
      `[accounting:stub] invoice #${invoice.invoiceNumber} (${invoice.total}) pushed`,
    );
    return { externalId: `stub-inv-${invoice.id}` };
  }

  async pushPayment(payment: SyncPayment) {
    console.log(
      `[accounting:stub] payment ${payment.amount} → ${payment.invoiceExternalId} pushed`,
    );
    return { externalId: `stub-pay-${payment.id}` };
  }
}

let provider: AccountingProvider | undefined;

export function getAccountingProvider(): AccountingProvider {
  // Future: switch on QUICKBOOKS_*/XERO_* env vars.
  if (!provider) provider = new StubAccountingProvider();
  return provider;
}
