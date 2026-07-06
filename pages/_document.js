import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <link rel="icon" href="/favicon.ico?v=4" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico?v=4" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=4" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=4" />
        <link rel="stylesheet" href="/assets/styles.css?v=schedule-edge-beige-20260706" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
