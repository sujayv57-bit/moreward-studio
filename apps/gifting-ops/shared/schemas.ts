// Validation schemas shared by the browser (inline form validation) and the server (authoritative).
import { z } from 'zod';

const req = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
const opt = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');
const optDate = z.union([dateStr, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
export const paise = z.number({ error: 'Enter an amount' }).int('Amount must be in whole paise').min(0, 'Amount cannot be negative').max(1e13);
const optPaise = z.union([paise, z.null()]).optional().transform((v) => (v ?? null));
const posInt = (label: string) => z.number({ error: `${label} is required` }).int(`${label} must be a whole number`).positive(`${label} must be at least 1`);
const optPosInt = z.union([z.number().int().positive(), z.null()]).optional().transform((v) => v ?? null);
const optEmail = z.union([z.email('Enter a valid email'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
const optPhone = z.union([z.string().trim().regex(/^[+\d][\d\s-]{6,16}$/, 'Enter a valid phone number'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
const userId = z.number({ error: 'Choose a person' }).int().positive('Choose a person');

export const LEAD_SOURCES = ['Founder network', 'Referral', 'Website', 'Inbound call', 'LinkedIn', 'Trade show', 'Existing customer', 'Other'] as const;

export const leadInput = z.object({
  company_name: req('Company'), contact_name: req('Contact name'), phone: optPhone, email: optEmail,
  source: req('Lead source'), occasion: opt, approx_qty: optPosInt, budget_paise: optPaise,
  required_by: optDate, locations: opt, notes: opt, owner_id: userId, next_follow_up: optDate,
  company_id: z.number().int().positive().optional().nullable(),
  confirm_duplicate: z.boolean().optional(),
});
export const activityInput = z.object({
  kind: z.enum(['call', 'meeting', 'note', 'email', 'whatsapp']), summary: req('Summary'), outcome: opt,
  next_follow_up: optDate,
});
export const taskInput = z.object({
  title: req('Title'), description: opt, owner_id: userId, due_at: optDate,
  entity_type: z.string().optional().nullable(), entity_id: z.number().int().optional().nullable(),
});
export const companyInput = z.object({ name: req('Company name'), gst_number: opt, industry: opt, address: opt, city: opt, owner_id: z.number().int().positive().optional().nullable(), notes: opt });
export const contactInput = z.object({ name: req('Name'), email: optEmail, phone: optPhone, designation: opt, is_primary: z.boolean().optional() });

export const requirementsInput = z.object({
  occasion: opt, recipients: optPosInt, budget_per_box_paise: optPaise, gift_theme: opt, customisation: opt,
  branding: opt, packaging: opt, delivery_locations: opt, delivery_by: optDate, dietary_or_restrictions: opt, notes: opt,
});
export const quoteLineInput = z.object({
  description: req('Item'), category: opt, qty: posInt('Quantity'), unit_price_paise: paise, unit_cost_paise: paise.optional(), customisation: opt,
});
export const quoteVersionInput = z.object({
  lines: z.array(quoteLineInput).min(1, 'Add at least one line'),
  shipping_paise: paise, tax_bp: z.number().int().min(0).max(10000), tax_name: opt,
  validity_date: dateStr, delivery_date: dateStr, notes: opt, change_note: opt,
  expected_version: z.number().int().optional(),
});
export const feasibilityResultInput = z.object({
  result: z.enum(['feasible', 'at_risk', 'infeasible']), earliest_delivery: dateStr, est_cost_paise: optPaise,
  max_quantity: optPosInt, notes: req('Notes'),
});
export const customerApprovalInput = z.object({
  version: posInt('Version'), approver_name: req('Approver name'), approved_on: dateStr, reference: opt,
  attachment_id: z.number().int().positive().optional().nullable(),
}).refine((v) => v.reference || v.attachment_id, { message: 'Add a reference (email subject, PO number) or attach the approval', path: ['reference'] });
export const destinationInput = z.object({ label: req('Label'), address: req('Address'), city: opt, pincode: z.union([z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'), z.literal(''), z.null()]).optional().transform((v) => v || null), contact_name: opt, phone: optPhone });
export const convertInput = z.object({
  procurement_owner_id: userId, due_date: dateStr, customer_po_ref: opt,
  destinations: z.array(destinationInput).min(1, 'Add at least one delivery destination'),
});

export const vendorInput = z.object({
  legal_name: req('Legal name'), display_name: req('Display name'), phone: optPhone, email: optEmail, address: opt, city: opt,
  serviceable_locations: opt, categories: z.array(z.string()).default([]), capabilities: opt, customisation_options: opt,
  lead_time_days: optPosInt, moq: optPosInt, capacity_per_week: optPosInt, payment_terms: opt,
  sample_available: z.boolean().optional(), preferred_comm: opt, notes: opt,
  gst_number: z.union([z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'GSTIN format looks wrong (15 characters)'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  pan_number: z.union([z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN format looks wrong (10 characters)'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  onboarding_owner_id: z.number().int().positive().optional().nullable(), onboarding_due: optDate,
  confirm_duplicate: z.boolean().optional(), expected_version: z.number().int().optional(),
});
export const bankInput = z.object({
  account_name: req('Account name'), account_number: z.string().trim().regex(/^\d{6,18}$/, 'Account number should be 6–18 digits'),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC should look like ABCD0123456'), bank_name: req('Bank name'), upi_id: opt,
});
export const vendorQuoteInput = z.object({
  unit_price_paise: paise, tax_bp: z.number().int().min(0).max(10000), shipping_paise: paise, moq: optPosInt,
  lead_time_days: posInt('Lead time'), availability: opt, valid_until: dateStr, notes: opt, attachment_id: z.number().int().optional().nullable(),
});
export const shipmentInput = z.object({
  destination_id: z.number().int().positive(), items: z.array(z.object({ variant_id: z.number().int().positive(), qty: posInt('Quantity') })).min(1, 'Add at least one item'),
  courier: opt, notes: opt,
});
export const issueInput = z.object({
  order_id: z.number().int().positive().optional().nullable(), vendor_id: z.number().int().positive().optional().nullable(),
  kind: z.enum(['shortage', 'damage', 'quality', 'failed_delivery', 'replacement', 'return', 'other']), title: req('Title'), detail: opt,
  priority: z.enum(['low', 'medium', 'high', 'urgent']), owner_id: userId, due_date: optDate,
});
export const paymentInput = z.object({ kind: z.enum(['advance', 'payment']), amount_paise: paise.refine((v) => v > 0, 'Amount must be more than zero'), received_on: dateStr, reference: req('Payment reference'), attachment_id: z.number().int().optional().nullable() });
export const vendorPaymentInput = z.object({ kind: z.enum(['advance', 'balance']), amount_paise: paise.refine((v) => v > 0, 'Amount must be more than zero'), paid_on: dateStr, reference: req('Payment reference'), attachment_id: z.number().int().optional().nullable() });
export const invoiceInput = z.object({ number: req('Invoice number'), amount_paise: paise.refine((v) => v > 0, 'Amount must be more than zero'), issued_on: dateStr, due_on: optDate, notes: opt });
export const userInput = z.object({
  name: req('Name'), email: z.email('Enter a valid email'), roles: z.array(z.string()).min(1, 'Choose at least one role'),
  password: z.string().min(10, 'Password must be at least 10 characters').optional(), active: z.boolean().optional(),
});
