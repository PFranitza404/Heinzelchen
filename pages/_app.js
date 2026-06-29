import Head from "next/head";
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="icon" href="favicon.ico?v=4" sizes="any" />
        <link rel="shortcut icon" href="favicon.ico?v=4" />
        <link rel="icon" type="image/png" sizes="32x32" href="favicon.png?v=4" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png?v=4" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/assets/styles.css?v=form-uniform-provider-progress" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
