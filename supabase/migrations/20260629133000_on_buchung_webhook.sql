alter table bookings
add column if not exists auftragsnummer integer;

create unique index if not exists bookings_auftragsnummer_key
on bookings (auftragsnummer)
where auftragsnummer is not null;

drop trigger if exists on_buchung_insert_webhook on bookings;

create trigger on_buchung_insert_webhook
after insert on bookings
for each row
execute function supabase_functions.http_request(
  'https://jgwezvijqucpiobqjzir.supabase.co/functions/v1/on-buchung',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
