import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { marked } from "marked";

const root = process.cwd();
const markdownPath = path.join(root, "docs", "report", "report.md");
const htmlPath = path.join(root, "docs", "report", "report.html");
const pdfPath = path.join(root, "docs", "report", "report.pdf");
const cssPath = path.join(root, "docs", "report", "report.css");

marked.setOptions({
  gfm: true
});

const markdown = fs.readFileSync(markdownPath, "utf8");
const htmlBody = marked.parse(markdown);
const htmlDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CollabWrite Midterm Report</title>
    <link rel="stylesheet" href="./report.css" />
  </head>
  <body>
    ${htmlBody}
  </body>
</html>
`;

fs.writeFileSync(htmlPath, htmlDocument, "utf8");
console.log(`Wrote ${path.relative(root, htmlPath)}`);

if (process.argv.includes("--pdf")) {
  const chromeBinary = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  execFileSync(
    chromeBinary,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`
    ],
    {
      stdio: "inherit"
    }
  );
  console.log(`Wrote ${path.relative(root, pdfPath)}`);
}
