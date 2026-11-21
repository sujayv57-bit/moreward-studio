/**
 * Integration boundary for outbound providers (email, WhatsApp, courier tracking, payments, accounting).
 *
 * No provider is implemented or configured in this build. The app therefore:
 *  - shows each integration as "Not configured" in the UI,
 *  - offers editable message drafts + a manual "Contacted customer/vendor" log instead of sending,
 *  - records payments, tracking and invoice references that staff enter by hand.
 * It never reports a send, booking, payment or sync as successful. To add a provider, implement the
 * matching interface below, return it from `loadProviders`, and surface the provider's real response.
 */
export interface SendResult { ok: boolean; providerMessageId?: string; error?: string }
export interface MessageProvider { send(to: string, subject: string, body: string): Promise<SendResult> }
export interface Providers { email: MessageProvider | null; whatsapp: MessageProvider | null; courier: null; payments: null; accounting: null }

export function loadProviders(_env: NodeJS.ProcessEnv): Providers {
  return { email: null, whatsapp: null, courier: null, payments: null, accounting: null };
}
export function providerFlags(p: Providers) {
  return { email: !!p.email, whatsapp: !!p.whatsapp, courier: !!p.courier, payments: !!p.payments, accounting: !!p.accounting };
}
