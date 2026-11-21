# Gifting Ops

Internal operations platform for an Indian corporate gifting company (≈11 people, ≈₹4 crore turnover).
One place to run the journey **lead → requirements → feasibility and costing → quotation → customer approval → confirmed order → procurement → goods received → quality check → packing → dispatch → delivered → payment closure**.

The **Order Workspace** is the central record: sales, procurement, warehouse, dispatch, finance and management work on the same order, each with role-specific actions. Every order has a named sales owner, a named procurement owner, a stage, a due date, a next action with an owner, a blocker (with reason, owner and next action) when it is delayed, and a timestamped history.

> This app lives in `apps/gifting-ops/` of a repository that also contains an unrelated marketing website (the repository root). It has its own `package.json` and does not affect the website's build or deployment.

---

## Quick start (local review)

Requirements: Node.js 22+ (tested on 22.23). No other services: the database is a local SQLite file.

```bash
cd apps/gifting-ops
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run db:reset
```

```bash
npm run dev
```

Open http://localhost:5173 (the API runs on :3001; Vite proxies `/api`). `db:reset` deletes the local database and loads the **demo workspace** (fictional data). `npm run db:reset -- --empty` creates only the demo users.

**Demo accounts** (local review only; password for all: `demo-password-2026`). The sign-in page lists them in development.

| Person | Email | Roles |
|---|---|---|
| Aarav Mehta | founder@example.com | Founder / admin |
| Priya Nair | priya.sales@example.com | Sales manager |
| Rohan Kapoor | rohan.sales@example.com | Sales executive |
| Sneha Iyer | sneha.sales@example.com | Sales executive |
| Vikram Singh | vikram.procurement@example.com | Procurement manager |
| Anjali Desai | anjali.procurement@example.com | Procurement executive |
| Karan Joshi | karan.procurement@example.com | Procurement executive + Packing / quality (multi-role) |
| Meera Pillai | meera.warehouse@example.com | Packing / quality |
| Suresh Yadav | suresh.warehouse@example.com | Packing / quality |
| Imran Khan | imran.dispatch@example.com | Dispatch |
| Kavya Reddy | kavya.finance@example.com | Finance |

**Production-style run** (serves the built UI from the API process):

```bash
npm run build && NODE_ENV=production npm start
```

Put it behind HTTPS (the session cookie is `Secure` in production). For a local HTTP check of a production build only, add `COOKIE_SECURE=false`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm run build` | Type-check, then build the UI into `dist/` |
| `npm start` | Run the API (serves `dist/` when `NODE_ENV=production`) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:reset` | Recreate the local DB with demo data (refuses when `NODE_ENV=production`) |
| `npm run db:backup` | Online backup of the DB + uploaded files into `data/backups/<timestamp>/` |
| `npx tsx server/cli.ts create-admin <email> "<name>" <password>` | Create the first real admin in a fresh production database |
| `npm run lint` / `npm run typecheck` | ESLint (incl. jsx-a11y) / TypeScript |
| `npm test` | Unit + API integration tests (Vitest), incl. the 12 acceptance scenarios |
| `npm run test:e2e` | Browser end-to-end tests (Playwright) against a freshly seeded app |
| `npm run verify` | All of the above in sequence |

## Stack and why

- **TypeScript everywhere**; shared Zod schemas validate forms in the browser and every request on the server.
- **Server:** Node 22 + Express 5. Small, well-known, no framework lock-in; route handlers are thin and business rules live in `server/rules/`.
- **Database:** SQLite via `better-sqlite3`, with ordered SQL migrations (`migrations/`). For an 11-person team on one server it is the most maintainable relational option: one file to back up, real transactions, foreign keys, no separate service. The SQL is plain and portable; moving to PostgreSQL later means porting the migrations and a handful of SQLite date functions.
- **UI:** React 19 + React Router, built with Vite. Components are our own small accessible kit (`src/ui.tsx`) built on native elements: `<dialog>` for modals (focus trap and Esc built in), ARIA tabs with arrow keys, labelled fields with inline errors, status pills that always pair an icon with text. This keeps the bundle small and avoids a component-library dependency for a team that will maintain the app.
- **Tests:** Vitest drives the real HTTP API against an in-memory database; Playwright drives the real UI.

Versions were checked against what npm currently publishes (Express 5.x, React 19.x, Vite 8.x, Zod 4.x, Vitest 5.x, Playwright 1.63). ESLint is pinned to 9 because `eslint-plugin-jsx-a11y` does not yet support ESLint 10.

## Architecture

```
apps/gifting-ops/
  migrations/001_init.sql      relational schema (money in integer paise, rates in basis points)
  shared/schemas.ts            Zod schemas used by browser and server
  shared/money.ts              decimal-safe money helpers (re-export of server/money.ts)
  server/
    app.ts                     Express app: auth, CSRF header check, idempotency, routes, error handling
    auth.ts, permissions.ts    sessions (httpOnly cookie, scrypt passwords, lockout), roles → permissions
    access.ts                  record-level scoping (orders/leads/companies/POs) + money-field redaction
    rules/                     business rules: orders (reconciliation, risk, stage readiness, blockers),
                               vendors (onboarding states, checklist, duplicates, performance),
                               approvals (registry), automations (scheduled notifications)
    routes/                    sales, quotes, orders, vendors, procurement, fulfilment, finance, home, admin, files
    integrations.ts            boundary for email/WhatsApp/courier/payments/accounting (none configured)
    seed.ts, seed-base.ts      demo workspace, created by driving the real API with a moving clock
  src/                         React UI (pages per area, shared components)
  tests/                       API/integration tests (12 acceptance scenarios + money unit tests)
  e2e/                         Playwright browser tests
```

### Data model (main tables)

users, sessions · companies, contacts · leads, activities, tasks · opportunities, feasibility_checks · quotations, quote_versions, quote_lines, customer_approvals · approvals · orders, order_team, box_variants, bom_items, destinations, allocations, artworks, order_costs · vendors, vendor_contacts, vendor_bank, vendor_documents, vendor_events · rfqs, vendor_quotes · purchase_orders, po_lines, po_delay_log, vendor_payments · goods_receipts, receipt_lines, quality_checks · packing_batches, packing_checklist_items · shipments, shipment_items, tracking_updates · issues · customer_payments, invoices · attachments · notifications, contact_log · audit_events · settings, categories, checklist_templates, message_templates.

## Key business rules (all enforced on the server)

**Sales**
- Leads record source, company, contact, occasion, quantity, budget, required date, locations, notes, owner, stage and next follow-up. Setting a follow-up keeps one open follow-up task per record.
- Duplicate detection on leads (company name with legal suffixes ignored, phone, email; also existing customers and contacts). Saving a likely duplicate needs an explicit "it is new" confirmation, which is logged.
- A lead can be qualified only with quantity, required date, budget and at least one logged conversation; the response lists exactly what is missing. Conversion creates/links the company and contact and an opportunity; the lead's history, tasks and files carry over.
- Quotations are versioned. A draft can be edited until it is submitted or sent; after that every change is a new version with a change note, and the UI shows what changed. Costs come from procurement (sales executives cannot set them); revisions carry costs forward.
- **Margin approval:** below the configured minimum (default 20%) a sales manager must approve; below the floor (default 10%) the founder must approve. Thresholds are Settings.
- **Feasibility gate:** a quotation can be recorded as sent (a firm price/date commitment) only if the latest completed feasibility check is not "infeasible", the quoted date is not earlier than the feasible date, and the quantity is within the feasible maximum. Otherwise only a sales manager or the founder can override, with a reason that is stored on the version and in history.
- Customer approval records the approver, date, reference or attachment, and **the exact version** (which must have been sent). Only a customer-approved quotation can be converted, once.
- **Handoff:** conversion requires a procurement owner, a due date and at least one delivery address; creates box variants from the approved lines, links files, creates a handoff task, and notifies the procurement owner.

**Orders**
- Stages move forward one at a time and each move lists what is missing (with a link to the tab to fix it): BOM for every box, every box allocated to a destination, owners and dates (→ procurement); all components received (→ goods received/quality check); all components accepted, no open quality/shortage issues, artwork approved where required (→ packing), unless an approved partial-packing exception exists; at least one packed-and-checked batch (→ dispatch). **Delivered** is set automatically only when every box to every destination is delivered. **Payment closure** needs a zero balance and an invoice reference, or a founder override with a reason.
- Every order always shows a next action and its owner. It is "blocked" when someone set a blocker (reason + owner + next action required), when there is an open high/urgent issue, or when the delivery risk is "late".
- **Delivery risk** is computed from live data: components not on any PO (using their lead time), vendor promised dates (past, after the due date, or inside the checking/packing buffer), delayed or failed shipments. Reasons are listed; there is no hidden score.
- Contents are locked once packing starts (founder can still edit). Artwork has versions; packing needs an approved version or a logged override by a manager/founder.

**Vendors and procurement**
- Onboarding states: Draft → Information requested → Documents pending → Under review → Approved → Active, plus Rejected, Suspended, Inactive; allowed moves are fixed, and reasons are required for rejecting, suspending, deactivating, requesting information and reinstating.
- Under review needs every required field, a contact, every required document (not expired) and bank details. **Approved** additionally needs finance/admin to have checked each document and verified the bank details, and must be done by a role listed in Settings (default procurement manager or founder); the approver and time are recorded.
- Duplicate vendor detection by name, GSTIN, PAN, phone and email (including contacts).
- **Bank details** are visible and editable only by finance and the founder. Every change is logged (masked), flagged for review, notifies finance/admin, and **blocks vendor payments until someone other than the person who changed them verifies the change**. Sensitive documents are downloadable only by finance/admin, and those downloads are audited. Changes to GSTIN/PAN/legal name after approval are flagged.
- **Purchase orders** go only to approved or active vendors. Anything else needs a procurement manager/founder override with a reason, logged on the PO, the vendor and the audit trail. The vendor's status is checked again when a draft is issued. POs above the configured value raised by an executive need manager approval.
- RFQs compare quotes side by side: landed cost (goods + tax + shipping), landed cost per unit, lead time, expected arrival, delivery risk against the needed-by date and buffer, and flags (expired quote, MOQ above need, unapproved vendor). Selection needs a reason; a backup source can be recorded (warned if a critical component has none).
- Receipts cannot exceed what is outstanding. Rejected units at quality check are owed as replacements unless marked return/credit; reconciliation shows required, ordered, received, accepted, rejected, awaiting check, incoming, still needed, and units not on any PO.
- A vendor delay (reschedule, or confirmation with a later date) is logged for vendor performance and both order owners are told the effect on the customer delivery date.
- Vendor performance: on-time rate = completed POs fully received on or before the **original** promised date ÷ completed POs; rejection rate = rejected ÷ received units. Shown only after a configurable number of completed POs; until then counts only.

**Warehouse and dispatch**
- Packing batches are allowed only in the packing/dispatch stage and only for as many boxes as accepted, unused components allow (unless a partial-packing exception is approved). The checklist is generated from the bill of materials (quantities for the batch) plus template steps. Every item must be ticked before "packed". A different person must check the batch (setting).
- Shipments may only contain checked boxes not yet shipped, and only up to what is allocated to that destination. Manual tracking updates; "delayed" notifies the sales owner; "failed" opens a failed-delivery issue. Delivery needs a receiver name or proof-of-delivery file.

**Finance**
- Money is stored as **integer paise** with an explicit currency (INR default); rates in basis points. Percentages round **half up** to the nearest paisa. Tax is applied to lines + shipping charged. Margin is measured on pre-tax revenue.
- Actual margin = issued POs (pre-tax + shipping; vendor tax counted only if the Setting says so) + other recorded costs. It is marked provisional while any component is not on a PO.
- Customer balance = order total − payments. Due date = earliest invoice due date, else delivery date + payment terms (Setting). Payments and invoices are **recorded, not processed**.
- CSV exports (receivables, payables, customer payments, vendor payments, invoices, margins) for the accounting team, with spreadsheet-formula injection protection; each export is audited.

**Notifications and automations** (in-app)
New lead assignment, follow-ups due/overdue, feasibility requested/overdue, approvals needed/decided, customer approval chase (task), sales → procurement handoff and stalled handoff, vendor onboarding overdue with missing items, vendor review needed, vendor quote overdue, PO confirmation overdue, vendor arrival approaching / missed, vendor delay with customer impact, partial delivery, quality failure (procurement owner, sales owner, packing team), delivery risk, packing due, dispatch due, shipment delayed/overdue/failed, order delivered, customer balance overdue (finance + sales owner), vendor document expiring/expired, sensitive vendor changes, mentions and task assignment. Each notification has a deduplication key encoding the situation (e.g. the due date), so re-running checks never repeats it but a new date does notify. Checks run every 15 minutes and on demand ("Run checks now" on Home for managers).

**Security and reliability**
- Server-enforced permissions on every route; record-level scoping in every list, detail, search and attachment query, so restricted records return "not found" through direct URLs and API calls. Users without costing visibility (packing, dispatch) receive no money fields at all.
- Sessions: random 256-bit tokens (stored hashed), httpOnly SameSite=Lax cookie, 12-hour expiry, scrypt password hashes, lockout after 5 failed attempts for 15 minutes. CSRF: every state-changing request must carry a custom header.
- Uploads: allow-listed extensions and MIME types, magic-byte check, size limit, random on-disk names, downloads served with `nosniff`, a restrictive CSP and `Content-Disposition`. SVG/HTML are refused.
- Multi-record changes run in transactions. POSTs carry an idempotency key so double clicks and retries do not act twice. Edits to orders, leads, opportunities, companies, vendors and quotations carry the version the user loaded; if someone else changed the record, the save is refused with a clear message and the form keeps the user's input.
- Important records are archived, not deleted; every business change is written to the audit log with user and time.

## Integrations

No external provider is configured or implemented. The app shows each as **Not configured** (Settings → Integrations) and offers a working manual path instead:

| Service | Manual path today |
|---|---|
| Email / WhatsApp | Editable message drafts filled from the record; copy, send from your own account, then "log as contacted". Nothing is sent from the app and it never shows a fake "sent". |
| Courier | Courier, docket number, expected date and status updates entered by dispatch. |
| Payments | Finance records payments with bank references and attachments; nothing is collected or paid. |
| Accounting | CSV exports; invoice numbers entered from the accounting system, which remains the source of truth. |

`server/integrations.ts` defines the boundary. Wiring a provider means implementing its adapter, surfacing the provider's real success/failure in the UI, and adding its credentials to the environment.

## Backup and restore

- **Backup:** `npm run db:backup` takes a consistent online SQLite backup (safe while the app runs) and copies `uploads/`, into `data/backups/<timestamp>/`. Schedule it daily (cron/Task Scheduler) and copy the folder off the server (encrypted cloud storage or another machine). Keep at least 30 daily copies.
- **Restore:** stop the app; copy `gifting-ops.db` from the backup to `DATABASE_PATH` (remove any `-wal`/`-shm` files next to the old database); copy `uploads/` back to `UPLOADS_DIR`; start the app (migrations run automatically on start). Test a restore on a spare machine at least monthly.

## Screens

- **Sign in** — work email and password; lockout after repeated failures.
- **Home** — my tasks and follow-ups (overdue/today), approvals waiting for me, orders needing attention (late, at risk, blocked, with owner and next action), issues I own, a role summary (sales/procurement/warehouse/dispatch/finance cards linking to filtered lists) and, for the founder and managers, a management overview (orders by stage, active value, blocked/late, on-time deliveries in 30 days, team workload, overrides and exceptions in 30 days).
- **Tasks / Approvals / Notifications** — task list with filters, create/assign, done, snooze; approvals inbox with approve/reject and reasons; notification history with unread filter and mark-as-read.
- **Global search** (top bar, `/` to focus, arrow keys + Enter) — customers, leads, opportunities, quotations, orders, vendors and PO numbers you are allowed to see.
- **Sales → Leads** — search, filters (stage, owner, overdue follow-up), sorting, pagination; create/edit with duplicate warning; lead page with details, call/meeting log with next follow-up, reassign, qualify (shows what is missing), convert, mark lost with reason, history.
- **Sales → Companies** — directory with counts; company page with contacts (add/edit/primary/archive), opportunities, orders, new opportunity.
- **Sales → Opportunities** — list with feasibility and quotation status and value; opportunity page with structured requirements, feasibility request and result (procurement records it), quotations, activity log (including the original lead's), files, tasks, lost reason, history.
- **Quotation** — current version with lines, totals, line and overall margin (for costing roles), changes vs. the previous version, earlier versions, procurement costing, submit for approval, feasibility gate with override, record as sent, customer approval (exact version + reference/file), customer declined, revise, convert to order with destinations, follow-up message draft, print/PDF.
- **Orders** — list with search, stage/status/due/owner filters, sorting and pagination; each row shows risk or blocker and the next action with its owner.
- **Order Workspace** — stage tracker and status banner, then tabs: **Overview** (readiness for the next stage, move stage, owners, team, mark/clear blocker, edit with due-date change reason, tasks, customer message), **Requirements**, **Box contents** (variants, BOM, destinations, allocation matrix, artwork versions with approval/reject/override), **Costing** (estimated vs actual margin, PO costs, extra costs), **Approvals** (including partial-packing exception), **Procurement** (reconciliation, RFQs, POs), **Goods received** (receive against POs), **Quality** (checks and history), **Packing** (packability per box, batches, generated checklists, packed/checked by different people), **Shipments** (ready-to-ship, per-destination plan, dispatch, manual tracking, delivery with POD), **Payments** (finance only: payments, invoices, vendor balances, reminder draft), **Files**, **Issues**, **Activity** (timeline with filters, comments with mentions, conversation log).
- **Procurement** — queue (orders in sourcing with component status and risk, feasibility checks, quotes awaited, POs awaiting confirmation); **Vendors** (directory with onboarding progress, document-expiry and bank-review alerts; vendor page with onboarding checklist and allowed state changes, profile, contacts, documents with expiry and verification, restricted bank details with change review and verification, contact/sample/incident/performance log, attachments, performance and purchase history, message drafts); **RFQs** (create for an order component, invite vendors, record/decline quotes, side-by-side comparison, select with reason and backup, create PO with override path); **Purchase orders** (list; create from components with vendor-status warning; PO page with issue, confirmation, delays, receiving, quality checks, close short, cancel, vendor payments, files, approvals, vendor message drafts); **Receiving** (mobile-friendly list of what is due in).
- **Packing / Dispatch / Issues** — packing queue with readiness and progress; dispatch queue with ready boxes and shipments on the road; issues list with filters and edit/resolve.
- **Finance** — customer balances, overdue list, vendor balances and advances, order margins, CSV exports.
- **Reports** — sales pipeline and conversion (by stage, source, lost reasons, win rate, by date range), orders by stage and due date, delay reasons (vendor delays, issues, blocked orders), vendor performance, order profitability, receivables ageing and payables.
- **Settings** — team and roles (founder), workflow and approval thresholds, stage names and targets, tax rates and money settings, vendor onboarding rules, product categories, checklist templates, notification rules, message templates, integration status, audit log (founder).

## Assumptions made (to confirm)

- Thresholds: margin approval below 20% (manager) and 10% (founder); PO approval above ₹50,000 for executives; 3-day buffer to check, pack and ship; 30-day customer payment terms when no invoice due date is recorded. All are Settings.
- Vendor GST is excluded from actual cost by default (input credit assumed); switchable in Settings.
- Warehouse (packing/quality) staff can see orders in the physical stages so they can receive anything inbound; dispatch sees orders from packing onwards; executives see the orders they own or are on the team for; managers, finance and the founder see all.
- Procurement can see vendor bank status but not the details; finance enters bank details and a second finance/admin person verifies.
- Required vendor documents: GST certificate, PAN card, cancelled cheque (Settings).
- Quantities are whole units.

## Client decisions needed before production

1. **Approval thresholds and authorities:** margin minimum and floor, PO value limit, who approves vendors, whether one person may both pack and check in a pinch.
2. **Tax treatment:** GST rates per product category, whether vendor GST is a cost, how shipping is taxed.
3. **Accounting system** (Tally, Zoho Books, QuickBooks…) and what to sync (invoices, receipts, vendor bills), or whether CSV exports suffice.
4. **Communication providers:** email (e.g. Google Workspace/SES) and WhatsApp Business API provider, sender identities, and which messages may be sent automatically.
5. **Courier partners** and whether tracking integration is worth it.
6. **Hosting:** a small VM or managed host in India with HTTPS, daily off-site backups and who holds admin access; or a move to PostgreSQL if multiple servers are planned.
7. **Vendor documents** to require (e.g. FSSAI for food vendors, MSME certificate) and document retention period.
8. **Data access:** whether sales executives should see each other's customers, and whether warehouse staff should see all inbound orders.
9. **Single sign-on** (Google Workspace) vs. passwords; password policy.
10. **Real data import:** existing customers, vendors and open orders (a CSV import is not built yet).

## Known limitations

- No external integrations (by design, see above).
- No bulk import of existing customers/vendors/orders; no PDF generation beyond the browser's print-to-PDF of the quotation page.
- No password-reset email (an admin resets passwords in Settings → Team).
- Risk filtering on the order list is computed in memory after querying (fine for hundreds of orders a year; revisit at tens of thousands).
- SQLite suits a single server; moving to multiple app servers would need PostgreSQL.
- The scheduled checks run inside the app process; if the app is down, they resume on the next start.
