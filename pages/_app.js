import Head from "next/head";
import Script from "next/script";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    document.body.className = pageProps.bodyClass || "";
    return () => {
      document.body.className = "";
    };
  }, [pageProps.bodyClass]);

  return (
    <>
      <Head>
        <link rel="icon" href="favicon.ico?v=4" sizes="any" />
        <link rel="shortcut icon" href="favicon.ico?v=4" />
        <link rel="icon" type="image/png" sizes="32x32" href="favicon.png?v=4" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png?v=4" />
        <link rel="stylesheet" href="/assets/styles.css?v=form-uniform-provider-progress" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css" />
      </Head>
      <Script src="/assets/cookie-banner.js" strategy="afterInteractive" />
      <Component {...pageProps} />
    </>
  );
}
