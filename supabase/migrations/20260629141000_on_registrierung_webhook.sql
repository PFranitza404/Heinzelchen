drop trigger if exists on_registrierung_insert_webhook on workers;

create trigger on_registrierung_insert_webhook
after insert on workers
for each row
execute function supabase_functions.http_request(
  'https://jgwezvijqucpiobqjzir.supabase.co/functions/v1/on-registrierung',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
