/** @type {import('next').NextConfig} */
const htmlRedirects = [
  ["/index.html", "/"],
  ["/agb.html", "/agb"],
  ["/anbieter-werden.html", "/anbieter-werden"],
  ["/buchen.html", "/buchen"],
  ["/datenschutz.html", "/datenschutz"],
  ["/impressum.html", "/impressum"],
  ["/kontakt-aufnehmen.html", "/kontakt-aufnehmen"],
  ["/kontakt.html", "/kontakt"],
  ["/leistungen.html", "/leistungen"],
  ["/nutzungsbedingungen.html", "/nutzungsbedingungen"],
];

const nextConfig = {
  async redirects() {
    return [
      ...htmlRedirects.map(([source, destination]) => ({
        source,
        has: [{ type: "host", value: "heinzelchen.com" }],
        destination: `https://www.heinzelchen.com${destination}`,
        statusCode: 301,
      })),
      {
        source: "/heinzelchen-werden",
        has: [{ type: "host", value: "heinzelchen.com" }],
        destination: "https://www.heinzelchen.com/anbieter-werden",
        statusCode: 301,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "heinzelchen.com" }],
        destination: "https://www.heinzelchen.com/:path*",
        statusCode: 301,
      },
      ...htmlRedirects.map(([source, destination]) => ({
        source,
        destination,
        statusCode: 301,
      })),
      {
        source: "/heinzelchen-werden",
        destination: "/anbieter-werden",
        statusCode: 301,
      },
    ];
  },
}
module.exports = nextConfig
