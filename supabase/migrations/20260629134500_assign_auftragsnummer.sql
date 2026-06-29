create or replace function assign_auftragsnummer(booking_id uuid)
returns integer
language plpgsql
as $$
declare
  existing_auftragsnummer integer;
  next_auftragsnummer integer;
begin
  select auftragsnummer
    into existing_auftragsnummer
    from bookings
   where id = booking_id
   for update;

  if not found then
    raise exception 'booking with id % does not exist', booking_id;
  end if;

  if existing_auftragsnummer is not null then
    return existing_auftragsnummer;
  end if;

  next_auftragsnummer := get_next_auftragsnummer();

  update bookings
     set auftragsnummer = next_auftragsnummer
   where id = booking_id;

  return next_auftragsnummer;
end;
$$;
