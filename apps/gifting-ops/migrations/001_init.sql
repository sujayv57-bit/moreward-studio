-- Gifting Ops schema. Money is INTEGER paise (never floats). Rates are basis points (1800 = 18%).
-- Timestamps are ISO-8601 UTC text. Important business records use archived_at (soft delete).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '[]',          -- JSON array of role keys; a person may hold several
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                       -- sha256 of the cookie token
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by INTEGER, updated_at TEXT);
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL, user_id INTEGER NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE checklist_templates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,   -- packing | receiving | dispatch
  items TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, channel TEXT NOT NULL,
  party TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL
);

-- ---------- Sales ----------
CREATE TABLE companies (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, gst_number TEXT, industry TEXT, address TEXT, city TEXT,
  owner_id INTEGER REFERENCES users(id), notes TEXT, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_companies_name ON companies(name COLLATE NOCASE);
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL,
  email TEXT, phone TEXT, designation TEXT, is_primary INTEGER NOT NULL DEFAULT 0, archived_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE leads (
  id INTEGER PRIMARY KEY, company_id INTEGER REFERENCES companies(id), contact_id INTEGER REFERENCES contacts(id),
  company_name TEXT NOT NULL, contact_name TEXT NOT NULL, phone TEXT, email TEXT,
  source TEXT NOT NULL, occasion TEXT, approx_qty INTEGER, budget_paise INTEGER, required_by TEXT, locations TEXT, notes TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  stage TEXT NOT NULL DEFAULT 'new',          -- new | contacted | qualified | converted | lost
  next_follow_up TEXT, lost_reason TEXT, opportunity_id INTEGER,
  archived_at TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_leads_owner ON leads(owner_id, stage);
CREATE TABLE opportunities (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), contact_id INTEGER REFERENCES contacts(id),
  lead_id INTEGER REFERENCES leads(id), title TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES users(id),
  stage TEXT NOT NULL DEFAULT 'requirements', -- requirements | feasibility | quotation | awaiting_approval | won | lost
  approx_qty INTEGER, budget_paise INTEGER, required_by TEXT, occasion TEXT,
  requirements TEXT NOT NULL DEFAULT '{}',     -- JSON of structured requirement fields
  lost_reason TEXT, order_id INTEGER, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE activities (
  id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                          -- call | meeting | note | email | whatsapp
  summary TEXT NOT NULL, outcome TEXT, by_user INTEGER NOT NULL REFERENCES users(id), at TEXT NOT NULL
);
CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id);
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, owner_id INTEGER NOT NULL REFERENCES users(id),
  due_at TEXT, status TEXT NOT NULL DEFAULT 'open',   -- open | done | cancelled
  kind TEXT NOT NULL DEFAULT 'follow_up', entity_type TEXT, entity_id INTEGER, order_id INTEGER,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX idx_tasks_owner ON tasks(owner_id, status, due_at);

CREATE TABLE feasibility_checks (
  id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  requested_by INTEGER NOT NULL REFERENCES users(id), assigned_to INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'requested',     -- requested | completed
  result TEXT,                                  -- feasible | at_risk | infeasible
  earliest_delivery TEXT, est_cost_paise INTEGER, max_quantity INTEGER, notes TEXT,
  requested_at TEXT NOT NULL, completed_at TEXT, completed_by INTEGER REFERENCES users(id)
);
CREATE TABLE quotations (
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | pending_approval | approved | sent | customer_approved | rejected | expired
  archived_at TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE quote_versions (
  id INTEGER PRIMARY KEY, quotation_id INTEGER NOT NULL REFERENCES quotations(id), version INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR', validity_date TEXT, delivery_date TEXT, shipping_paise INTEGER NOT NULL DEFAULT 0,
  tax_name TEXT, tax_bp INTEGER NOT NULL DEFAULT 0,
  subtotal_paise INTEGER NOT NULL DEFAULT 0, tax_paise INTEGER NOT NULL DEFAULT 0, total_paise INTEGER NOT NULL DEFAULT 0,
  est_cost_paise INTEGER NOT NULL DEFAULT 0, margin_bp INTEGER,
  notes TEXT, change_note TEXT, feasibility_id INTEGER REFERENCES feasibility_checks(id),
  commitment_override_by INTEGER REFERENCES users(id), commitment_override_reason TEXT,
  sent_at TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL,
  UNIQUE (quotation_id, version)
);
CREATE TABLE quote_lines (
  id INTEGER PRIMARY KEY, version_id INTEGER NOT NULL REFERENCES quote_versions(id), sort INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL, category TEXT, qty INTEGER NOT NULL, unit_price_paise INTEGER NOT NULL,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0, customisation TEXT
);
CREATE TABLE customer_approvals (
  id INTEGER PRIMARY KEY, quotation_id INTEGER NOT NULL REFERENCES quotations(id), version_id INTEGER NOT NULL REFERENCES quote_versions(id),
  approver_name TEXT NOT NULL, approved_on TEXT NOT NULL, reference TEXT, attachment_id INTEGER, recorded_by INTEGER NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL
);
CREATE TABLE approvals (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,   -- quote_margin | vendor | po_value | partial_packing | override | artwork_override | payment_override
  entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, order_id INTEGER,
  title TEXT NOT NULL, detail TEXT, requested_by INTEGER NOT NULL REFERENCES users(id),
  required_permission TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  decided_by INTEGER REFERENCES users(id), decided_at TEXT, decision_note TEXT, requested_at TEXT NOT NULL
);
CREATE INDEX idx_approvals_status ON approvals(status, required_permission);

-- ---------- Orders ----------
CREATE TABLE orders (
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, company_id INTEGER NOT NULL REFERENCES companies(id),
  contact_id INTEGER REFERENCES contacts(id), opportunity_id INTEGER REFERENCES opportunities(id),
  quotation_id INTEGER REFERENCES quotations(id), quote_version_id INTEGER REFERENCES quote_versions(id),
  title TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR',
  sales_owner_id INTEGER NOT NULL REFERENCES users(id), procurement_owner_id INTEGER REFERENCES users(id),
  stage TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | procurement | goods_received | quality_check | packing | dispatch | delivered | closed
  due_date TEXT, next_action TEXT, blocker_reason TEXT, blocker_owner_id INTEGER REFERENCES users(id),
  customer_po_ref TEXT, requirements TEXT NOT NULL DEFAULT '{}',
  subtotal_paise INTEGER NOT NULL DEFAULT 0, tax_paise INTEGER NOT NULL DEFAULT 0, total_paise INTEGER NOT NULL DEFAULT 0,
  est_cost_paise INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_orders_stage ON orders(stage, due_date);
CREATE TABLE order_team (order_id INTEGER NOT NULL REFERENCES orders(id), user_id INTEGER NOT NULL REFERENCES users(id), duty TEXT NOT NULL, PRIMARY KEY (order_id, user_id, duty));
CREATE TABLE box_variants (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), name TEXT NOT NULL, qty INTEGER NOT NULL,
  customisation TEXT, artwork_required INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE bom_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), variant_id INTEGER NOT NULL REFERENCES box_variants(id),
  component_name TEXT NOT NULL, category TEXT, qty_per_box INTEGER NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'pc',
  is_packaging INTEGER NOT NULL DEFAULT 0, is_critical INTEGER NOT NULL DEFAULT 0, spec TEXT,
  est_unit_cost_paise INTEGER NOT NULL DEFAULT 0, lead_time_days INTEGER, archived_at TEXT
);
CREATE TABLE destinations (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), label TEXT NOT NULL, address TEXT NOT NULL,
  city TEXT, pincode TEXT, contact_name TEXT, phone TEXT
);
CREATE TABLE allocations (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), variant_id INTEGER NOT NULL REFERENCES box_variants(id),
  destination_id INTEGER NOT NULL REFERENCES destinations(id), qty INTEGER NOT NULL, UNIQUE (variant_id, destination_id)
);
CREATE TABLE artworks (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), variant_id INTEGER REFERENCES box_variants(id),
  version INTEGER NOT NULL, attachment_id INTEGER, notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | rejected
  approved_by_name TEXT, approved_on TEXT, override_by INTEGER REFERENCES users(id), override_reason TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE order_costs (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,                        -- packaging | customisation | shipping | other
  description TEXT NOT NULL, amount_paise INTEGER NOT NULL, incurred_on TEXT NOT NULL, recorded_by INTEGER REFERENCES users(id)
);
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, order_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'file', filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER REFERENCES users(id), uploaded_at TEXT NOT NULL, archived_at TEXT
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

-- ---------- Vendors ----------
CREATE TABLE vendors (
  id INTEGER PRIMARY KEY, legal_name TEXT NOT NULL, display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | info_requested | documents_pending | under_review | approved | active | rejected | suspended | inactive
  status_reason TEXT, onboarding_owner_id INTEGER REFERENCES users(id), onboarding_due TEXT,
  phone TEXT, email TEXT, address TEXT, city TEXT, serviceable_locations TEXT, categories TEXT NOT NULL DEFAULT '[]',
  capabilities TEXT, customisation_options TEXT, lead_time_days INTEGER, moq INTEGER, capacity_per_week INTEGER,
  payment_terms TEXT, sample_available INTEGER NOT NULL DEFAULT 0, preferred_comm TEXT, notes TEXT,
  gst_number TEXT, pan_number TEXT,
  approved_by INTEGER REFERENCES users(id), approved_at TEXT,
  archived_at TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE TABLE vendor_contacts (
  id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id), name TEXT NOT NULL, phone TEXT, email TEXT, role TEXT, is_primary INTEGER NOT NULL DEFAULT 0
);
-- Bank details live in their own table so they can be permissioned and audited separately.
CREATE TABLE vendor_bank (
  vendor_id INTEGER PRIMARY KEY REFERENCES vendors(id), account_name TEXT, account_number TEXT, ifsc TEXT, bank_name TEXT, upi_id TEXT,
  verified_by INTEGER REFERENCES users(id), verified_at TEXT, changed_at TEXT, changed_by INTEGER REFERENCES users(id),
  review_required INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE vendor_documents (
  id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id), kind TEXT NOT NULL, attachment_id INTEGER,
  reference TEXT, expires_on TEXT, sensitive INTEGER NOT NULL DEFAULT 1, verified_by INTEGER REFERENCES users(id), verified_at TEXT,
  uploaded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE vendor_events (
  id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  kind TEXT NOT NULL,  -- contact | note | sample | quality_incident | performance | status_change | sensitive_change | override
  summary TEXT NOT NULL, by_user INTEGER REFERENCES users(id), at TEXT NOT NULL
);
CREATE TABLE rfqs (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), bom_item_id INTEGER REFERENCES bom_items(id),
  title TEXT NOT NULL, qty INTEGER NOT NULL, needed_by TEXT, status TEXT NOT NULL DEFAULT 'open', -- open | awarded | cancelled
  selected_quote_id INTEGER, selection_reason TEXT, backup_quote_id INTEGER, is_critical INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE vendor_quotes (
  id INTEGER PRIMARY KEY, rfq_id INTEGER NOT NULL REFERENCES rfqs(id), vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  status TEXT NOT NULL DEFAULT 'requested', -- requested | received | declined
  unit_price_paise INTEGER, tax_bp INTEGER, shipping_paise INTEGER NOT NULL DEFAULT 0, moq INTEGER, lead_time_days INTEGER,
  availability TEXT, valid_until TEXT, notes TEXT, attachment_id INTEGER,
  requested_at TEXT NOT NULL, response_due TEXT, received_at TEXT, UNIQUE (rfq_id, vendor_id)
);
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, order_id INTEGER REFERENCES orders(id), vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  vendor_quote_id INTEGER REFERENCES vendor_quotes(id), currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | pending_approval | issued | confirmed | partially_received | received | cancelled
  original_promised_date TEXT, promised_date TEXT, issued_at TEXT, confirmed_at TEXT, confirmation_due TEXT,
  shipping_paise INTEGER NOT NULL DEFAULT 0, advance_required_paise INTEGER NOT NULL DEFAULT 0,
  override_by INTEGER REFERENCES users(id), override_reason TEXT, notes TEXT,
  owner_id INTEGER REFERENCES users(id), archived_at TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE po_lines (
  id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_orders(id), bom_item_id INTEGER REFERENCES bom_items(id),
  description TEXT NOT NULL, qty_ordered INTEGER NOT NULL, unit_price_paise INTEGER NOT NULL, tax_bp INTEGER NOT NULL DEFAULT 0,
  qty_received INTEGER NOT NULL DEFAULT 0, qty_accepted INTEGER NOT NULL DEFAULT 0, qty_rejected INTEGER NOT NULL DEFAULT 0,
  qty_cancelled INTEGER NOT NULL DEFAULT 0, cancel_reason TEXT  -- quantity procurement agreed will not come (credit/return without replacement)
);
CREATE TABLE vendor_payments (
  id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_orders(id), kind TEXT NOT NULL, -- advance | balance
  amount_paise INTEGER NOT NULL, paid_on TEXT NOT NULL, reference TEXT, attachment_id INTEGER, recorded_by INTEGER REFERENCES users(id)
);
CREATE TABLE po_delay_log (
  id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_orders(id), old_date TEXT, new_date TEXT, reason TEXT NOT NULL, by_user INTEGER, at TEXT NOT NULL
);

-- ---------- Goods, quality, packing, dispatch ----------
CREATE TABLE goods_receipts (
  id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_orders(id), received_on TEXT NOT NULL,
  received_by INTEGER NOT NULL REFERENCES users(id), notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE receipt_lines (
  id INTEGER PRIMARY KEY, receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id), po_line_id INTEGER NOT NULL REFERENCES po_lines(id),
  qty_received INTEGER NOT NULL, discrepancy TEXT
);
CREATE TABLE quality_checks (
  id INTEGER PRIMARY KEY, po_line_id INTEGER NOT NULL REFERENCES po_lines(id), receipt_line_id INTEGER REFERENCES receipt_lines(id),
  qty_checked INTEGER NOT NULL, qty_accepted INTEGER NOT NULL, qty_rejected INTEGER NOT NULL,
  outcome TEXT NOT NULL,                       -- passed | partial | failed
  reason TEXT, action TEXT,                    -- replace | return | credit | accept_with_concession
  checked_by INTEGER NOT NULL REFERENCES users(id), checked_at TEXT NOT NULL, issue_id INTEGER
);
CREATE TABLE packing_batches (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), variant_id INTEGER NOT NULL REFERENCES box_variants(id),
  qty INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | packed | checked
  exception_approval_id INTEGER REFERENCES approvals(id), assigned_to INTEGER REFERENCES users(id),
  packed_by INTEGER REFERENCES users(id), packed_at TEXT, checked_by INTEGER REFERENCES users(id), checked_at TEXT,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE packing_checklist_items (
  id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES packing_batches(id), label TEXT NOT NULL,
  required_qty INTEGER, bom_item_id INTEGER, done INTEGER NOT NULL DEFAULT 0, done_by INTEGER REFERENCES users(id), done_at TEXT
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), destination_id INTEGER NOT NULL REFERENCES destinations(id),
  courier TEXT, tracking_no TEXT, dispatched_on TEXT, expected_on TEXT,
  status TEXT NOT NULL DEFAULT 'planned', -- planned | dispatched | in_transit | delayed | delivered | failed
  delivered_on TEXT, received_by_name TEXT, pod_attachment_id INTEGER, notes TEXT,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE shipment_items (id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id), variant_id INTEGER NOT NULL REFERENCES box_variants(id), qty INTEGER NOT NULL);
CREATE TABLE tracking_updates (id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id), status TEXT NOT NULL, note TEXT, by_user INTEGER, at TEXT NOT NULL);
CREATE TABLE issues (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), vendor_id INTEGER REFERENCES vendors(id), po_id INTEGER,
  kind TEXT NOT NULL, -- shortage | damage | quality | failed_delivery | replacement | return | other
  title TEXT NOT NULL, detail TEXT, priority TEXT NOT NULL DEFAULT 'medium', owner_id INTEGER NOT NULL REFERENCES users(id),
  due_date TEXT, status TEXT NOT NULL DEFAULT 'open', -- open | in_progress | resolved
  resolution TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, resolved_at TEXT
);

-- ---------- Finance ----------
CREATE TABLE customer_payments (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, -- advance | payment
  amount_paise INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', received_on TEXT NOT NULL, reference TEXT, attachment_id INTEGER,
  recorded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), number TEXT NOT NULL, amount_paise INTEGER NOT NULL,
  issued_on TEXT NOT NULL, due_on TEXT, notes TEXT, recorded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);

-- ---------- Cross-cutting ----------
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
  link TEXT, dedupe_key TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL, UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE TABLE contact_log (
  id INTEGER PRIMARY KEY, party TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, order_id INTEGER,
  channel TEXT NOT NULL, summary TEXT NOT NULL, by_user INTEGER NOT NULL REFERENCES users(id), at TEXT NOT NULL,
  delivery TEXT NOT NULL DEFAULT 'manual'      -- manual = staff logged it themselves; sent/failed only come from a real provider
);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER,
  order_id INTEGER, summary TEXT NOT NULL, details TEXT
);
CREATE INDEX idx_audit_order ON audit_events(order_id, at);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);
