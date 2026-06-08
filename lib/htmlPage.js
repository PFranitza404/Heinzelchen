const Head = require("next/head").default;
const Script = require("next/script").default;

function normalizeScriptSrc(src) {
  if (!src || /^https?:\/\//i.test(src)) return src;
  return src.startsWith("/") ? src : `/${src}`;
}

function HtmlPage({ title, body, scripts, bodyClass }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div className={bodyClass} dangerouslySetInnerHTML={{ __html: body }} />
      {scripts.map((script, index) => {
        if (script.src) {
          return <Script key={`${script.src}-${index}`} src={normalizeScriptSrc(script.src)} strategy="afterInteractive" />;
        }
        return (
          <Script
            key={`inline-${index}`}
            id={`legacy-inline-${index}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: script.inline }}
          />
        );
      })}
    </>
  );
}

module.exports = {
  HtmlPage,
};
