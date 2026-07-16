const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const files = [
  path.join(root, "lib", "html-mail-template.js"),
  path.join(root, "supabase", "functions", "_shared", "html-mail-template.ts"),
];

const expected = {
  blue: "#5578A8",
  red: "#A63D52",
  beige: "#E4DCCB",
  card: "#EEE8DA",
  darkBlue: "#466997",
  logoUrl: "https://heinzelchen.com/assets/finales-heinzelchen-logo-transparent.png",
};

const readBrandValue = (source, key) => {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return match?.[1] || "";
};

let failed = false;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(expected)) {
    const actual = readBrandValue(source, key);
    if (actual !== value) {
      failed = true;
      console.error(`${path.relative(root, file)}: ${key} ist "${actual}", erwartet "${value}"`);
    }
  }

  if (!source.includes("<div style=\"margin:8px 0 0;")) {
    failed = true;
    console.error(`${path.relative(root, file)}: Schriftzug "Heinzelchen" unter dem Logo fehlt.`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Email branding check passed.");
}
