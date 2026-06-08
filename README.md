# Helfende Haende

Website fuer einen Studenten-Helfer-Service mit Kundenbuchung, Arbeiter-Registrierung, Ausweis-Upload, Arbeiter-Kalender, Supabase und Resend Emails.

## Lokal starten

1. Abhaengigkeiten installieren:

```bash
npm install
```

2. `.env` aus `.env.example` befuellen.

3. Website-Server starten:

```bash
env PORT=3001 node index.js
```

Lokale URLs:

- Website: `http://localhost:3001`
- Buchung: `http://localhost:3001/leistungen.html`
- Arbeiter Registrierung: `http://localhost:3001/arbeiter-registrierung`
- Arbeiter Dashboard: `http://localhost:3001/arbeiter-dashboard`

## Environment Variablen

```env
PORT=3001
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
MAIL_FROM=
PUBLIC_URL=
SUPABASE_ID_CARD_BUCKET=worker-documents
FORCE_HTTPS=true
NODE_ENV=production
```

Wichtig:

- `SUPABASE_SERVICE_ROLE_KEY` niemals ins Frontend kopieren.
- `.env` ist in `.gitignore` und darf nicht auf GitHub.
- Arbeiter-Passwoerter werden nicht im Projekt gespeichert, sondern ueber Supabase Auth verwaltet.

## Supabase einrichten

1. Supabase Projekt erstellen.
2. In Project Settings -> API diese Werte kopieren:
   - Project URL -> `SUPABASE_URL`
   - anon public key -> `SUPABASE_ANON_KEY`
   - service_role key -> `SUPABASE_SERVICE_ROLE_KEY`
3. In Supabase SQL Editor den Inhalt von `supabase-schema.sql` ausfuehren.
4. Storage Bucket `worker-documents` pruefen:
   - Public: `false`
   - Ausweise liegen privat unter `ausweise/`.

## Resend einrichten

1. Resend Account erstellen.
2. Domain verifizieren.
3. API Key erstellen und als `RESEND_API_KEY` in `.env` setzen.
4. Absender setzen:

```env
EMAIL_FROM=Helfende Haende <noreply@deine-domain.de>
```

Ohne `RESEND_API_KEY` werden Emails nicht echt verschickt, sondern als Konsolen-Vorschau protokolliert.

## Live-Gang Checkliste

- [ ] Korrekte Supabase Keys in `.env` gesetzt.
- [ ] `supabase-schema.sql` im Supabase SQL Editor ausgefuehrt.
- [ ] Storage Bucket `worker-documents` ist privat.
- [ ] Resend Domain verifiziert.
- [ ] `RESEND_API_KEY` gesetzt.
- [ ] `EMAIL_FROM` nutzt eine verifizierte Domain.
- [ ] `PUBLIC_URL` auf echte Domain gesetzt.
- [ ] `FORCE_HTTPS=true` gesetzt.
- [ ] Hosting erzwingt HTTPS.
- [ ] `.env` ist nicht im Git-Repository.
- [ ] Testbuchung kommt in Supabase an.
- [ ] Test-Arbeiterregistrierung inklusive Ausweis funktioniert.
- [ ] Email-Log zeigt Versandstatus.
- [ ] Kalender-Verfuegbarkeiten werden in Supabase gespeichert.
