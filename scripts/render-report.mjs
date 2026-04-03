import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const diagramsDir = path.join(root, "docs", "diagrams");
const renderedDir = path.join(diagramsDir, "rendered");
const reportDir = path.join(root, "docs", "report");
const mermaidConfigPath = path.join(diagramsDir, "puppeteer-config.json");

const diagrams = [
  "system-context",
  "container",
  "backend-components",
  "data-model",
  "ai-lifecycle"
];

fs.mkdirSync(renderedDir, { recursive: true });

for (const diagram of diagrams) {
  const inputPath = path.join(diagramsDir, `${diagram}.mmd`);
  const pdfPath = path.join(renderedDir, `${diagram}.pdf`);
  const svgPath = path.join(renderedDir, `${diagram}.svg`);

  execFileSync(
    "npx",
    [
      "-y",
      "@mermaid-js/mermaid-cli",
      "-p",
      mermaidConfigPath,
      "-i",
      inputPath,
      "-o",
      pdfPath
    ],
    {
      stdio: "inherit"
    }
  );

  execFileSync(
    "npx",
    [
      "-y",
      "@mermaid-js/mermaid-cli",
      "-p",
      mermaidConfigPath,
      "-i",
      inputPath,
      "-o",
      svgPath
    ],
    {
      stdio: "inherit"
    }
  );

  console.log(`Rendered ${path.relative(root, pdfPath)} and ${path.relative(root, svgPath)}`);
}

execFileSync(
  "tectonic",
  [
    "-X",
    "compile",
    "report.tex",
    "--outdir",
    "."
  ],
  {
    cwd: reportDir,
    stdio: "inherit"
  }
);

console.log(`Wrote ${path.relative(root, path.join(reportDir, "report.pdf"))}`);
