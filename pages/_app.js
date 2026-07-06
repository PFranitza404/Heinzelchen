import Script from "next/script";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    document.documentElement.lang = "de";
    document.body.className = pageProps.bodyClass || "";
    return () => {
      document.body.className = "";
    };
  }, [pageProps.bodyClass]);

  return (
    <>
      <Script src="/assets/cookie-banner.js" strategy="afterInteractive" />
      <Component {...pageProps} />
    </>
  );
}
