-- ─── Helper: Refund SMS Credit ──────────────────────────────────────────────
-- Atomically refunds 1 credit. Used when an SMS send fails after credit was
-- already deducted, so the user is not charged for a message that was never
-- delivered.

create or replace function public.refund_sms_credit(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update public.sms_credits
    set balance = balance + 1,
        lifetime_used = greatest(lifetime_used - 1, 0),
        updated_at = now()
    where company_id = p_company_id;

  return found;
end;
$$;
