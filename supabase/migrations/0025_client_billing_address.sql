-- 0025_client_billing_address.sql
-- Billing address captured once, wherever the deal lives, then carried:
--   lead → deposit/upfront invoice → client (at promotion) → every future
--   invoice/quotation ("Bill to" prefills; still editable per document).

alter table public.clients
    add column if not exists billing_address text not null default '';

alter table public.leads
    add column if not exists billing_address text not null default '';
