import { HtmlPage } from "../lib/htmlPage";

export default HtmlPage;

export async function getStaticProps() {
  const { getStaticHtmlProps } = require("../lib/readHtmlPage");
  return getStaticHtmlProps("arbeiter-dashboard.html");
}
