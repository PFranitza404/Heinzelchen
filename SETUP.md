# Heinzelchen E-Mail-Setup

## 1. Resend vorbereiten

1. In Resend eine Domain hinzufügen.
2. Die DNS-Einträge bei deinem Domain-Anbieter setzen.
3. Warten, bis Resend die Domain als verifiziert anzeigt.
4. Einen API-Key in Resend erzeugen.
5. In `supabase/functions/send-confirmation/index.ts` den Platzhalter-Absender ersetzen:

```ts
const FROM_EMAIL = "Heinzelchen <noreply@deine-domain.de>";
```

## 2. Supabase Secrets setzen

Im Projektordner ausführen:

```bash
supabase secrets set RESEND_API_KEY=re_...
```

Prüfen, dass diese Secrets in Supabase vorhanden sind:

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
```

## 3. Edge Function deployen

```bash
supabase functions deploy send-confirmation
```

## 4. Database Webhooks anlegen

In Supabase:

1. Database öffnen.
2. Webhooks öffnen.
3. Neuen Webhook für Buchungen anlegen:
   - Tabelle: `bookings`
   - Event: `INSERT`
   - Typ: `Supabase Edge Functions`
   - Ziel: `send-confirmation`
4. Neuen Webhook für Heinzelchen-Anmeldungen anlegen:
   - Tabelle: `workers`
   - Event: `INSERT`
   - Typ: `Supabase Edge Functions`
   - Ziel: `send-confirmation`

## 5. Testen

1. Eine Testbuchung über die Website oder direkt in Supabase einfügen.
2. Eine Test-Anmeldung über die Website oder direkt in Supabase einfügen.
3. Edge-Function-Logs prüfen.
4. Resend-Logs prüfen.
5. Prüfen, ob die E-Mails angekommen sind.
