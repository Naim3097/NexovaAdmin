-- 0025_client_billing_address.sql
-- Billing address stored ON the client record so invoices/quotations prefill
-- their "Bill to" automatically at creation (still editable per document).

alter table public.clients
    add column if not exists billing_address text not null default '';
