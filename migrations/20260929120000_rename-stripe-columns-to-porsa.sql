-- Rename the payment-provider identifier columns from the Stripe era to Porsa.
-- Values in existing rows are historical Stripe ids; they are nullable and no
-- longer read by the app, so a plain rename preserves history without data loss.

alter table public.subscriptions
  rename column stripe_customer_id to porsa_customer_id;

alter table public.subscriptions
  rename column stripe_subscription_id to porsa_payment_id;
