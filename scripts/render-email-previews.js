const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const {
  renderMailLayout,
  mailParagraph,
  mailHeading,
  mailButton,
  mailLink,
  mailInfoTable,
  mailList,
} = require("../lib/html-mail-template");

const outputDir = path.join(__dirname, "..", "email-previews");
const stripeUrl = "https://book.stripe.com/8x23cu4URd0vaXRcji3Ru00";
const privacyUrl = "https://heinzelchen.com/datenschutz.html";
const termsUrl = "https://heinzelchen.com/nutzungsbedingungen.html";
const agbUrl = "https://heinzelchen.com/agb.html";

const previews = {
  "01-buchungsanfrage-intern.html": renderMailLayout({
    title: "Neue Buchungsanfrage [1024]",
    preheader: "Eine neue Buchungsanfrage ist eingegangen.",
    children: `
      ${mailHeading("Was")}
      ${mailInfoTable([
        ["Dienstleistungen", "Gartenarbeit, Hausreinigung"],
        ["Details", "Rasen mähen und Küche gründlich reinigen."],
        ["Geschätzte Dauer", "3 Stunden"],
      ])}
      ${mailHeading("Wann")}
      ${mailInfoTable([
        ["Zeitfenster", "12.07.2026 von 09:00 bis 13:00 Uhr"],
        ["Häufigkeit", "Einmalig"],
      ])}
      ${mailHeading("Kontakt")}
      ${mailInfoTable([
        ["Name", "Maria Muster"],
        ["E-Mail", "maria@example.com"],
        ["Telefon", "0174 2997866"],
      ])}
    `,
  }),
  "02-registrierung-intern.html": renderMailLayout({
    title: "Neue Heinzelchen-Registrierung",
    preheader: "Eine neue Heinzelchen-Registrierung ist eingegangen.",
    children: `
      ${mailHeading("Kontakt")}
      ${mailInfoTable([
        ["Name", "Lena Beispiel"],
        ["E-Mail", "lena@example.com"],
        ["Telefon", "0174 2997866"],
        ["Geburtsdatum", "2001-04-12"],
      ])}
      ${mailHeading("Dienstleistungen")}
      ${mailList(["Gartenarbeit - 18 EUR / Stunde", "Bügeln - 16 EUR / Stunde"])}
      ${mailHeading("Bestätigungen")}
      ${mailInfoTable([
        ["AGB akzeptiert", "Ja"],
        ["Datenschutz akzeptiert", "Ja"],
        ["Qualifikation bestätigt", "Ja"],
      ])}
    `,
  }),
  "03-auftrag-an-heinzelchen.html": renderMailLayout({
    title: "Neuer Auftrag für dich",
    preheader: "Ein neuer Auftrag wartet auf dich.",
    children: `
      ${mailParagraph("Wir haben einen passenden Auftrag für dich gefunden. Bitte prüfe die Angaben und melde dich bei uns, falls etwas nicht passt.")}
      ${mailInfoTable([
        ["Kunde", "Maria Muster"],
        ["Leistung", "Gartenarbeit"],
        ["Termin", "12.07.2026 um 10:00 Uhr"],
        ["Adresse", "Musterstraße 1, 30159 Hannover"],
        ["Dauer", "3 Stunden"],
      ])}
    `,
  }),
  "04-angebot-zuweisung-kunde.html": renderMailLayout({
    title: "Ihr Heinzelchen ist gefunden",
    preheader: "Bestätigen Sie Ihren Auftrag mit der Vermittlungsgebühr.",
    children: `
      ${mailParagraph("Sehr geehrte Frau / sehr geehrter Herr Muster,")}
      ${mailParagraph("wir haben ein Heinzelchen für Sie gefunden. Lena kann am 12.07.2026 um 10:00 Uhr zu Ihnen kommen und verlangt 18 € pro Stunde. Wissen Sie Ihre Aufgabe in guten Händen und bestätigen Sie Ihren Auftrag mit der Zahlung der Vermittlungsgebühr.")}
      ${mailButton({ href: stripeUrl, label: "Jetzt 3 € zahlen und Auftrag bestätigen" })}
      ${mailParagraph("Wir freuen uns sehr über Ihre Buchung und die Gelegenheit, Ihnen den Alltag leichter zu machen.")}
      ${mailParagraph("Herzliche Grüße<br>Ihre Heinzelchen")}
      ${mailParagraph(`Mail: ${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>Telefon: ${mailLink("tel:+491742997866", "0174 2997866")}`)}
      ${mailHeading("Stornierung")}
      ${mailParagraph(`Die Vermittlungsgebühr von 3,00 € ist nach Zahlung nicht erstattbar. Möchten Sie umbuchen oder einen anderen Termin vereinbaren, wenden Sie sich direkt an uns oder stellen Sie eine neue Buchungsanfrage über ${mailLink("https://heinzelchen.com", "heinzelchen.com")}. Bei Nichterscheinen Ihres Heinzelchens erstatten wir die Vermittlungsgebühr auf Anfrage kulanzweise zurück.`)}
      ${mailParagraph(`${mailLink(agbUrl, "AGB")}<br>${mailLink(privacyUrl, "Datenschutzerklärung")}`)}
    `,
  }),
  "05-buchungsbestaetigung-kunde.html": renderMailLayout({
    title: "Ihre Anfrage bei den Heinzelchen",
    preheader: "Ihre Buchungsanfrage ist bei uns eingegangen.",
    children: `
      ${mailParagraph("Sehr geehrte Frau / sehr geehrter Herr Muster,")}
      ${mailParagraph("wir haben Ihre Anfrage erhalten und melden uns bei Ihnen schnellstmöglich mit einem Termin und Stundenlohn, sodass Sie den Buchungsprozess abschließen können und Ihre Aufgabe zuverlässig erledigt wird.")}
      ${mailParagraph("Sollten Sie Fragen haben, kontaktieren Sie uns gerne.")}
      ${mailParagraph("Herzliche Grüße von Ihren Heinzelchen")}
      ${mailParagraph(`${mailLink(privacyUrl, "Datenschutzerklärung")}<br>${mailLink(termsUrl, "Nutzungsbedingungen")}`)}
    `,
  }),
  "06-willkommensmail-heinzelchen.html": renderMailLayout({
    title: "Willkommen bei den Heinzelchen",
    preheader: "Ihre Registrierung ist bei uns eingegangen.",
    children: `
      ${mailParagraph("Moin Lena,")}
      ${mailParagraph("wir freuen uns sehr Dich als Heinzelchen für Gartenarbeit und Bügeln begrüßen zu dürfen. Wir werden Dich mit passenden Aufgaben in Deiner Umgebung belohnen.")}
      ${mailParagraph("Behalte Deine Mailbox aktiv im Auge, damit Du keine attraktiven Arbeitsgelegenheiten verpasst.")}
      ${mailParagraph("Solltest Du Deine Angaben ändern wollen oder irgendwelche Fragen haben, kontaktiere uns gerne jederzeit.")}
      ${mailParagraph("Herzliche Grüße<br>Dein Heinzelchen-Team")}
      ${mailParagraph(`${mailLink(privacyUrl, "Datenschutzerklärung")}<br>${mailLink(termsUrl, "Nutzungsbedingungen")}`)}
    `,
  }),
};

async function main() {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(previews).map(([fileName, html]) =>
    writeFile(path.join(outputDir, fileName), html, "utf8")
  ));
  console.log(`Rendered ${Object.keys(previews).length} email previews to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
