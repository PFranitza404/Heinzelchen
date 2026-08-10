---
Verwendungszweck: "Leeres Design-Gerüst für individuell entworfene Ausnahme-/Problemfall-Mails, die keiner der 6 Standard-Vorlagen entsprechen"
Mailprovider: "Hostinger (manueller Versand durch Kolleg:in)"
---

<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>[Titel]</title>
  </head>
  <body style="margin:0;padding:0;background:#E4DCCB;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">[Titel]</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#E4DCCB;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:0 0 20px;">
                <img src="https://heinzelchen.com/assets/finales-heinzelchen-logo-transparent.png" width="320" alt="Heinzelchen" style="display:block;width:320px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
                <div style="margin:8px 0 0;color:#A63D52;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;font-weight:700;">Heinzelchen</div>
              </td>
            </tr>
            <tr>
              <td style="background:#EEE8DA;border:1px solid rgba(85,120,168,.22);border-radius:18px;padding:30px 28px;font-family:Georgia,'Times New Roman',serif;color:#5578A8;font-size:17px;line-height:1.6;">
                <h1 style="margin:0 0 18px;color:#A63D52;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:700;">[Titel]</h1>
                <p style="margin:0 0 16px;color:#5578A8;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;">[Freitext-Body]</p>

                <!-- Optionaler Button: diesen Block nur verwenden, wenn die Mail eine klare Aktion enthält. -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:24px 0 22px;">
                  <tr>
                    <td bgcolor="#A63D52" style="border-radius:999px;background:#A63D52;">
                      <a href="[optionale Button-URL]" style="display:inline-block;padding:14px 22px;color:#FFFFFF;background:#A63D52;border-radius:999px;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;line-height:1.25;text-decoration:none;">[optionaler Button-Text]</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 10px 0;font-family:Georgia,'Times New Roman',serif;color:#5578A8;font-size:13px;line-height:1.5;">
                Heinzelchen &middot; <a href="mailto:info@heinzelchen.com" style="color:#5578A8;text-decoration:underline;">info@heinzelchen.com</a> &middot; <a href="tel:+491742997866" style="color:#5578A8;text-decoration:underline;">0174 2997866</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>

## Stilregeln

- Typischerweise rot markiert werden der Haupttitel sowie kurze Schlagwörter/Überschriften wie `Was`, `Wo`, `Wann`, `Häufigkeit`, `Kontaktdaten`, `Stornierung`, `AGB` oder vergleichbare Abschnittslabels.
- Blaue Elemente sind der normale Fließtext, Tabellenwerte, Kontaktangaben, Footer-Text und normale Textlinks.
- Buttons sind rot (`#A63D52`), weiß beschriftet, pillenförmig/abgerundet und enthalten nur eine klare Aktion. Normale Links bleiben blau und unterstrichen.
- `buchungen@heinzelchen.com` gehört in BCC, wenn die Mail eine konkrete Buchung/einen konkreten Auftrag betrifft und intern nachvollziehbar bleiben soll, an wen sie geschickt wurde. Bei reinen Registrierungs- oder allgemeinen Einzelmails ohne Buchungsbezug gehört sie nicht automatisch in BCC.
- Diese Mail wird manuell in Hostinger verschickt. Deshalb nur robustes HTML verwenden, das im Hostinger-Webmail-Editor sauber darstellbar ist: keine externen `<style>`-Blöcke, keine komplexen Skripte, keine eingebundenen CSS-Dateien, sondern Inline-CSS wie in den Standard-Vorlagen.
