const mailBrand = {
  blue: "#5578A8",
  red: "#A63D52",
  beige: "#E4DCCB",
  card: "#EEE8DA",
  darkBlue: "#466997",
  logoUrl: "https://heinzelchen.com/assets/heinzelchen-mail-logo.png",
};

function renderMailLayout({ title, preheader = "", children = "" }) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${mailBrand.beige};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${mailBrand.beige};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:0 0 20px;">
                <img src="${mailBrand.logoUrl}" width="220" alt="Heinzelchen" style="display:block;width:220px;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td style="background:${mailBrand.card};border:1px solid rgba(85,120,168,.22);border-radius:18px;padding:30px 28px;font-family:Georgia,'Times New Roman',serif;color:${mailBrand.blue};font-size:17px;line-height:1.6;">
                <h1 style="margin:0 0 18px;color:${mailBrand.red};font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:700;">${title}</h1>
                ${children}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 10px 0;font-family:Georgia,'Times New Roman',serif;color:${mailBrand.blue};font-size:13px;line-height:1.5;">
                Heinzelchen &middot; <a href="mailto:info@heinzelchen.com" style="color:${mailBrand.blue};text-decoration:underline;">info@heinzelchen.com</a> &middot; <a href="tel:+491742997866" style="color:${mailBrand.blue};text-decoration:underline;">0174 2997866</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function mailParagraph(content) {
  return `<p style="margin:0 0 16px;color:${mailBrand.blue};font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;">${content}</p>`;
}

function mailHeading(content) {
  return `<h2 style="margin:24px 0 10px;color:${mailBrand.red};font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;font-weight:700;">${content}</h2>`;
}

function mailButton({ href, label }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:24px 0 22px;">
    <tr>
      <td bgcolor="${mailBrand.red}" style="border-radius:999px;background:${mailBrand.red};">
        <a href="${href}" style="display:inline-block;padding:14px 22px;color:#FFFFFF;background:${mailBrand.red};border-radius:999px;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;line-height:1.25;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function mailLink(href, label) {
  return `<a href="${href}" style="color:${mailBrand.blue};text-decoration:underline;">${label}</a>`;
}

function mailInfoTable(rows) {
  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:7px 10px 7px 0;color:${mailBrand.red};font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.45;font-weight:700;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;color:${mailBrand.blue};font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.45;vertical-align:top;">${value || "-"}</td>
    </tr>`).join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:4px 0 16px;">${rowHtml}</table>`;
}

function mailList(items) {
  return `<ul style="margin:0 0 16px 20px;padding:0;color:${mailBrand.blue};font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;">${items.map((item) => `<li style="margin:0 0 8px;">${item}</li>`).join("")}</ul>`;
}

function mailListHtml(itemsHtml) {
  return `<ul style="margin:0 0 16px 20px;padding:0;color:${mailBrand.blue};font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;">${itemsHtml}</ul>`;
}

module.exports = {
  mailBrand,
  renderMailLayout,
  mailParagraph,
  mailHeading,
  mailButton,
  mailLink,
  mailInfoTable,
  mailList,
  mailListHtml,
};
