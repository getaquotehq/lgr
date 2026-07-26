-- Notify contact@leadgenrentals.com.au whenever a client submits a PPL
-- service area change request, so we can action it promptly.

create or replace function public.notify_ppl_area_change_request()
returns trigger
language plpgsql
security definer
as $$
declare
  v_company_name text;
  v_supabase_url text := current_setting('app.settings.supabase_url', true);
  v_service_key  text := current_setting('app.settings.service_role_key', true);
  v_msg          text;
begin
  select name into v_company_name
  from public.companies
  where id = new.company_id;

  v_msg := coalesce(new.message, '(no message)');

  perform net.http_post(
    url := coalesce(v_supabase_url, '') || '/functions/v1/resend-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'to', 'contact@leadgenrentals.com.au',
      'subject', 'PPL Area Change Request — ' || coalesce(v_company_name, 'Unknown Company'),
      'html', '<html><body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;padding:32px;color:#111827">'
        || '<h2 style="margin:0 0 16px">PPL Service Area Change Request</h2>'
        || '<p><strong>Company:</strong> ' || coalesce(v_company_name, 'Unknown') || '</p>'
        || '<p><strong>Message:</strong> ' || v_msg || '</p>'
        || '<p><strong>Submitted:</strong> ' || to_char(new.created_at, 'DD Mon YYYY HH24:MI TZ') || '</p>'
        || '<p style="margin-top:24px"><a href="https://leadgenrentals.com.au/admin" style="color:#1f6fff">Review in Admin</a></p>'
        || '</body></html>'
    )
  );

  return new;
exception
  when others then
    raise warning 'notify_ppl_area_change_request failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_ppl_area_change_request_notify on public.ppl_area_change_requests;
create trigger on_ppl_area_change_request_notify
  after insert on public.ppl_area_change_requests
  for each row
  execute function public.notify_ppl_area_change_request();
