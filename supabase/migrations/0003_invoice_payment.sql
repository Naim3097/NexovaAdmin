-- =============================================================================
-- 0003_invoice_payment.sql — payment-link metadata for invoices
-- =============================================================================
-- Adds columns the LeanX (Malaysian FPX) integration writes to.
-- Idempotent: uses "if not exists" so reapplying is safe.

alter table public.invoices
    add column if not exists payment_provider text,                      -- 'leanx' for now
    add column if not exists payment_link text,                          -- URL we send the client
    add column if not exists payment_external_id text,                   -- LeanX bill_no / invoice_no
    add column if not exists payment_meta jsonb not null default '{}'::jsonb, -- full provider payload for audit
    add column if not exists payment_link_created_at timestamptz;

-- Lookup by external id is the webhook's hot path.
create index if not exists invoices_payment_external_idx
    on public.invoices (payment_external_id)
    where payment_external_id is not null;
