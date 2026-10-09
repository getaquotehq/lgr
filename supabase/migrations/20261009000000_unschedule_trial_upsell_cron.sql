-- trial-upsell-daily-check (20260730120000) posts to a trial-upsell-check edge
-- function that was never committed and belongs to the retired trial model.
-- It has been calling a 404 every night since; stop it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'trial-upsell-daily-check') then
    perform cron.unschedule('trial-upsell-daily-check');
  end if;
end;
$$;
