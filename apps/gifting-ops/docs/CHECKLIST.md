# Implementation checklist

Status key: [x] done and verified through UI + API + DB, [~] partially done (see notes), [ ] not started.

## Increments
- [x] 1 Foundation: schema + migrations, auth/sessions (lockout, CSRF header), roles and permissions, audit, settings, decimal-safe money
- [x] 2 Sales: leads (duplicates, follow-ups, assignment), companies/contacts, opportunities with structured requirements, activities, tasks, feasibility, versioned quotations with diffs, costing, margin approvals, feasibility gate + override, customer approval of an exact version, conversion with handoff
- [x] 3 Orders: workspace with 14 tabs, variants + BOM, destinations/allocations, artwork versions + override, stage readiness, blockers, risk, history, comments, files, team
- [x] 4 Vendors + procurement: onboarding states and checklist, duplicates, documents with expiry/verification, restricted bank details with change review, RFQs + comparison, award with backup, POs (vendor gate, value approval, confirmation, delays, close short, cancel), vendor payments, performance
- [x] 5 Goods receipt, quality checks (issues + notifications), packing batches with BOM checklists and second-person check, shipments to multiple destinations, manual tracking, delivery with POD, issues
- [x] 6 Finance (balances, advances, invoices, margins, exports), reports (pipeline, orders, delays, vendors, profitability, receivables/payables), automations/notifications with dedupe, global search, settings, audit log
- [x] 7 Frontend for all of the above (desktop, tablet, phone)
- [x] 8 Tests: 18 Vitest tests (money + acceptance scenarios 1–12), 9 Playwright tests (keyboard, mobile, restricted roles, workflows)
- [x] 9 Docs: README (setup, stack, architecture, rules, backup/restore, screens, assumptions, client decisions, limitations), .env.example

## Acceptance scenarios → tests
| # | Scenario | Where proven |
|---|---|---|
| 1 | Lead, follow-up, qualify, quotation | tests/sales.test.ts; e2e "sales executive: lead → …" |
| 2 | Procurement costs; infeasible commitment needs approval | tests/sales.test.ts (gate + override + margin approval); e2e "cannot send a quotation…" |
| 3 | Customer approves exact version → order with handoff | tests/sales.test.ts |
| 4 | Vendor onboarded, reviewed, approved, compared, selected for PO | tests/vendors.test.ts |
| 5 | Unapproved/suspended vendor cannot get a normal PO | tests/vendors.test.ts |
| 6 | Short delivery updates remaining qty and delivery risk | tests/fulfilment.test.ts; e2e mobile receiving |
| 7 | QC rejection blocks packing, people notified | tests/fulfilment.test.ts; e2e "order stage gate…" |
| 8 | Two shipments, two destinations, delivered only when both done | tests/fulfilment.test.ts; e2e "packing check … partial dispatch" |
| 9 | Advances update balances and margin | tests/finance-security.test.ts; e2e finance |
| 10 | Restricted user cannot see bank/finance via UI or API | tests/finance-security.test.ts; e2e "restricted roles" |
| 11 | Overdue/risk notifications without duplicates | tests/automations-reports.test.ts |
| 12 | Search, filters, pagination, exports, dashboard figures | tests/automations-reports.test.ts; e2e keyboard search, exports |

## Not done (see README → Known limitations)
- [ ] External integrations (email, WhatsApp, courier, payments, accounting) — boundary + manual workflows only
- [ ] Bulk import of existing customers/vendors/orders
- [ ] Password-reset email
