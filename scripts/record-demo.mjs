import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const frontendUrl = "http://localhost:5173";
const apiBaseUrl = "http://127.0.0.1:4000";
const exportBaseUrl = "http://127.0.0.1:8000";
const outputDir = path.join(rootDir, "artifacts", "demo-recordings");
const logsDir = path.join(outputDir, "logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const rawVideoDir = path.join(outputDir, "raw");
const downloadDir = path.join(outputDir, "downloads");
const videoStem = `collabwrite-demo-${timestamp}`;
const mp4OutputPath = path.join(outputDir, `${videoStem}.mp4`);
const webmOutputPath = path.join(outputDir, `${videoStem}.webm`);
const venvActivatePath = path.join(rootDir, ".venv-export", "bin", "activate");

const SHORT_PAUSE_MS = 2500;
const MEDIUM_PAUSE_MS = 5000;
const LONG_PAUSE_MS = 8000;

function log(message) {
  console.log(`[demo] ${message}`);
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function fetchOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchOk(url)) {
      return;
    }
    await delay(500);
  }

  throw new Error(`Timed out while waiting for ${label} at ${url}.`);
}

async function requestJson(pathname, { method = "GET", token, body, expectedStatus } = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json();
  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(`${method} ${pathname} returned ${response.status}; expected ${expectedStatus}. Payload: ${JSON.stringify(payload)}`);
  }

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with ${response.status}. ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function loginToken(userId) {
  const payload = await requestJson("/v1/auth/login", {
    method: "POST",
    body: { userId },
    expectedStatus: 201
  });
  return payload.session.token;
}

function spawnManaged(label, command, args, options = {}) {
  const logFile = path.join(logsDir, `${label}-${timestamp}.log`);
  const output = createWriteStream(logFile);
  const child = spawn(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...options.env
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.pipe(output);
  child.stderr.pipe(output);

  return {
    label,
    logFile,
    pid: child.pid
  };
}

async function stopManaged(processInfo) {
  if (!processInfo?.pid) {
    return;
  }

  try {
    process.kill(-processInfo.pid, "SIGTERM");
  } catch {
    return;
  }

  await delay(1000);

  try {
    process.kill(-processInfo.pid, "SIGKILL");
  } catch {
    // The process may have exited after SIGTERM.
  }
}

async function ensureServices() {
  const startedProcesses = [];
  const frontendHealthy = await fetchOk(frontendUrl);
  const apiHealthy = await fetchOk(`${apiBaseUrl}/health`);
  const exportHealthy = await fetchOk(`${exportBaseUrl}/health`);

  if (frontendHealthy !== apiHealthy) {
    throw new Error("The frontend and API are in a partial running state. Stop the existing dev server or start both before recording.");
  }

  if (!frontendHealthy && !apiHealthy) {
    log("Starting frontend/API dev stack.");
    startedProcesses.push(spawnManaged("app", "npm", ["run", "dev"], {
      env: {
        AI_PROVIDER: "mock"
      }
    }));
  }

  if (!exportHealthy) {
    if (!await pathExists(venvActivatePath)) {
      throw new Error(`Missing export virtualenv at ${venvActivatePath}. Create it before recording the demo.`);
    }

    log("Starting export worker.");
    startedProcesses.push(
      spawnManaged("export", "/bin/zsh", ["-lc", `source '${venvActivatePath}' && npm run dev:export`])
    );
  }

  await waitForUrl(`${apiBaseUrl}/health`, "API health");
  await waitForUrl(frontendUrl, "frontend");
  await waitForUrl(`${exportBaseUrl}/health`, "export health");

  return async () => {
    for (const processInfo of startedProcesses.reverse()) {
      await stopManaged(processInfo);
    }
  };
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

async function loginAs(page, displayName) {
  await page.getByRole("button", { name: new RegExp(displayName) }).click();
  await page.locator(".app-shell").waitFor();
}

async function openDocument(page, title) {
  const card = page.locator(".doc-card", { hasText: title }).first();
  await card.waitFor();
  await card.click();
  await page.locator(".editor-header h2").filter({ hasText: title }).waitFor();
  await page.locator("textarea.editor-textarea").waitFor();
}

async function installOverlay(page) {
  await page.addInitScript(() => {
    function ensureOverlay() {
      let overlay = document.getElementById("__demo-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "__demo-overlay";
        Object.assign(overlay.style, {
          position: "fixed",
          top: "24px",
          left: "50%",
          zIndex: "2147483647",
          maxWidth: "460px",
          padding: "16px 18px",
          borderRadius: "16px",
          background: "rgba(15, 23, 42, 0.86)",
          color: "#f8fafc",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          boxShadow: "0 20px 48px rgba(15, 23, 42, 0.32)",
          backdropFilter: "blur(10px)",
          transform: "translateX(-50%)",
          pointerEvents: "none"
        });

        const title = document.createElement("div");
        title.id = "__demo-overlay-title";
        Object.assign(title.style, {
          fontSize: "20px",
          fontWeight: "700",
          lineHeight: "1.3"
        });

        const detail = document.createElement("div");
        detail.id = "__demo-overlay-detail";
        Object.assign(detail.style, {
          marginTop: "8px",
          fontSize: "13px",
          lineHeight: "1.5",
          color: "rgba(226, 232, 240, 0.92)"
        });

        overlay.appendChild(title);
        overlay.appendChild(detail);
        document.body.appendChild(overlay);
      }

      return overlay;
    }

    window.__demoSetOverlay = (title, detail) => {
      const overlay = ensureOverlay();
      const titleNode = document.getElementById("__demo-overlay-title");
      const detailNode = document.getElementById("__demo-overlay-detail");
      if (titleNode) {
        titleNode.textContent = title;
      }
      if (detailNode) {
        detailNode.textContent = detail ?? "";
      }
      overlay.style.display = "block";
    };

    window.__demoHideOverlay = () => {
      const overlay = document.getElementById("__demo-overlay");
      if (overlay) {
        overlay.style.display = "none";
      }
    };
  });
}

async function setOverlay(page, title, detail = "") {
  await page.evaluate(({ title: nextTitle, detail: nextDetail }) => {
    window.__demoSetOverlay(nextTitle, nextDetail);
  }, { title, detail });
}

async function hideOverlay(page) {
  await page.evaluate(() => {
    window.__demoHideOverlay();
  });
}

async function showIntro(page) {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          :root {
            color-scheme: light;
            font-family: "Avenir Next", "Segoe UI", sans-serif;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top left, rgba(30, 136, 229, 0.18), transparent 40%),
              radial-gradient(circle at bottom right, rgba(67, 160, 71, 0.16), transparent 42%),
              linear-gradient(135deg, #f8fafc, #e2e8f0);
            color: #0f172a;
          }
          .card {
            width: min(860px, calc(100vw - 80px));
            padding: 48px 54px;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
          }
          .eyebrow {
            margin: 0 0 12px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-size: 14px;
            color: #2563eb;
            font-weight: 700;
          }
          h1 {
            margin: 0;
            font-size: 44px;
            line-height: 1.1;
          }
          p {
            margin: 18px 0 0;
            font-size: 20px;
            line-height: 1.6;
            color: #334155;
          }
          ul {
            margin: 28px 0 0;
            padding-left: 22px;
            color: #0f172a;
            font-size: 18px;
            line-height: 1.9;
          }
        </style>
      </head>
      <body>
        <section class="card">
          <p class="eyebrow">Collaborative Document Editor Midterm</p>
          <h1>CollabWrite Demo</h1>
          <p>This recording highlights the core product workflow: realtime collaboration, AI-assisted writing, role-aware sharing, version history, export, and document creation.</p>
          <ul>
            <li>Frontend: React workspace and editor UX</li>
            <li>Backend: Express API and WebSocket collaboration hub</li>
            <li>AI: provider-backed suggestion flow with deterministic mock fallback</li>
            <li>Export: dedicated FastAPI worker for PDF, DOCX, and Markdown</li>
          </ul>
        </section>
      </body>
    </html>
  `);
  await delay(7000);
}

async function selectPhrase(page, phrase) {
  await page.locator("textarea.editor-textarea").evaluate((element, targetPhrase) => {
    const start = element.value.indexOf(targetPhrase);
    if (start === -1) {
      throw new Error(`Could not find phrase to select: ${targetPhrase}`);
    }

    const end = start + targetPhrase.length;
    element.focus();
    element.setSelectionRange(start, end);
    element.dispatchEvent(new Event("select", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
  }, phrase);
}

async function appendCollaboratorEdit(page, appendedText) {
  await page.locator("textarea.editor-textarea").evaluate((element, suffix) => {
    element.focus();
    element.value = `${element.value}${suffix}`;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, appendedText);
}

async function recordDemo() {
  await ensureDirectory(outputDir);
  await ensureDirectory(logsDir);
  await ensureDirectory(rawVideoDir);
  await ensureDirectory(downloadDir);

  const stopServices = await ensureServices();
  let browser;

  try {
    const ownerToken = await loginToken("user-layla");
    const editorToken = await loginToken("user-omar");
    const demoTitle = "Executive Launch Brief";
    const demoContent = [
      "# Executive Launch Brief",
      "",
      "CollabWrite helps product teams coordinate launch planning, preserve version history, and keep AI-assisted writing accountable.",
      "",
      "This draft needs a tighter executive summary, a sharper rollout plan, and a concise risk register before leadership review."
    ].join("\n");

    const created = await requestJson("/v1/documents", {
      method: "POST",
      token: ownerToken,
      body: {
        title: demoTitle,
        content: demoContent
      },
      expectedStatus: 201
    });

    const documentId = created.document.id;

    await requestJson(`/v1/documents/${documentId}/share`, {
      method: "POST",
      token: ownerToken,
      body: {
        principalType: "user",
        principalId: "user-omar",
        role: "editor",
        allowAi: true
      },
      expectedStatus: 200
    });

    await requestJson(`/v1/documents/${documentId}/share`, {
      method: "POST",
      token: ownerToken,
      body: {
        principalType: "user",
        principalId: "user-sara",
        role: "commenter",
        allowAi: true
      },
      expectedStatus: 200
    });

    await requestJson(`/v1/documents/${documentId}/share`, {
      method: "POST",
      token: ownerToken,
      body: {
        principalType: "user",
        principalId: "user-mona",
        role: "viewer",
        allowAi: false
      },
      expectedStatus: 200
    });

    log("Launching Playwright.");
    browser = await chromium.launch({
      headless: true
    });

    const primaryContext = await browser.newContext({
      viewport: {
        width: 1600,
        height: 900
      },
      colorScheme: "light",
      acceptDownloads: true,
      recordVideo: {
        dir: rawVideoDir,
        size: {
          width: 1600,
          height: 900
        }
      }
    });

    const collaboratorContext = await browser.newContext({
      viewport: {
        width: 1280,
        height: 800
      },
      colorScheme: "light"
    });

    const page = await primaryContext.newPage();
    const collaboratorPage = await collaboratorContext.newPage();
    await installOverlay(page);

    log("Recording intro.");
    await showIntro(page);

    log("Opening app and logging in.");
    await page.goto(frontendUrl, { waitUntil: "domcontentloaded" });
    await setOverlay(
      page,
      "1. Workspace Login",
      "Seeded users make the proof of concept easy to explore without external authentication dependencies."
    );
    await delay(MEDIUM_PAUSE_MS);
    await loginAs(page, "Layla Hassan");
    await openDocument(page, demoTitle);
    await delay(LONG_PAUSE_MS);

    log("Joining as collaborator.");
    await collaboratorPage.goto(frontendUrl, { waitUntil: "domcontentloaded" });
    await loginAs(collaboratorPage, "Omar Nabil");
    await openDocument(collaboratorPage, demoTitle);
    await setOverlay(
      page,
      "2. Real-Time Presence",
      "A second editor joins the same draft. Presence, role-aware access, and active collaborator counts update immediately."
    );
    await page.locator(".presence-pill", { hasText: "Omar Nabil" }).waitFor();
    await delay(10_000);

    log("Demonstrating live collaborative editing.");
    const collaboratorNote = "Omar added a launch dependency note during live collaboration.";
    await requestJson(`/v1/documents/${documentId}/content`, {
      method: "PUT",
      token: editorToken,
      body: {
        baseVersion: 1,
        content: `${demoContent}\n\n${collaboratorNote}`,
        reason: "Collaborator live edit"
      },
      expectedStatus: 200
    });
    await setOverlay(
      page,
      "3. Live Collaboration",
      "Edits are broadcast over WebSockets. The owner sees the updated content, cursor presence, and the new document version without a manual refresh."
    );
    await page.getByText("Another collaborator updated the shared draft.").waitFor();
    await page.locator("textarea.editor-textarea").waitFor({ state: "visible" });
    await page.locator("textarea.editor-textarea").evaluate((element, expected) => {
      if (!element.value.includes(expected)) {
        throw new Error("Expected live collaboration text to appear in the primary editor.");
      }
    }, collaboratorNote);
    await delay(11_000);

    log("Running AI suggestion flow.");
    const selectedSentence = "This draft needs a tighter executive summary, a sharper rollout plan, and a concise risk register before leadership review.";
    await selectPhrase(page, selectedSentence);
    await setOverlay(
      page,
      "4. AI-Assisted Writing",
      "The AI panel supports rewrite, summarize, restructure, proofread, translation, and cursor continuation. Here we request a concise summary and apply it back into the draft."
    );
    await delay(4000);
    await page.getByRole("button", { name: "Summarize" }).click();
    const aiPanel = page.locator(".inspector-card").filter({ hasText: "AI Assistant" });
    const applySuggestionButton = aiPanel.getByRole("button", { name: "Apply" }).first();
    await applySuggestionButton.waitFor({ timeout: 20_000 });
    await delay(6000);
    await applySuggestionButton.click();
    await page.getByText("AI suggestion applied.").waitFor();
    await delay(10_000);

    log("Updating sharing settings.");
    const sharingCard = page.locator(".inspector-card").filter({ hasText: "Sharing" });
    await sharingCard.scrollIntoViewIfNeeded();
    await setOverlay(
      page,
      "5. Role-Aware Sharing",
      "Owners can update collaborator roles and AI permissions directly in the workspace, while enforcement still happens on the backend."
    );
    await sharingCard.getByLabel("User").selectOption("user-mona");
    await sharingCard.getByLabel("Role").selectOption("commenter");
    const allowAiToggle = sharingCard.getByLabel("Allow AI for this principal");
    if (!await allowAiToggle.isChecked()) {
      await allowAiToggle.check();
    }
    await delay(3000);
    await sharingCard.getByRole("button", { name: "Update Sharing" }).click();
    await page.getByText("Sharing updated.").waitFor();
    await delay(10_000);

    log("Reverting document history.");
    const versionCard = page.locator(".inspector-card").filter({ hasText: "Version History" });
    await versionCard.scrollIntoViewIfNeeded();
    await setOverlay(
      page,
      "6. Version History and Revert",
      "Every meaningful content change becomes a new version. Users can inspect the history and roll back to an earlier snapshot."
    );
    await delay(4000);
    await versionCard.getByRole("button", { name: "Revert to this version" }).nth(1).click();
    await page.getByText(/Reverted to version/).waitFor();
    await delay(10_000);

    log("Exporting the document.");
    const exportCard = page.locator(".inspector-card").filter({ hasText: "Export" });
    await exportCard.scrollIntoViewIfNeeded();
    await setOverlay(
      page,
      "7. Multi-Format Export",
      "The workspace exports PDF, DOCX, or Markdown and can attach an appendix with the recorded AI interaction history."
    );
    await exportCard.getByLabel("Format").selectOption("pdf");
    const downloadPromise = page.waitForEvent("download");
    await delay(3000);
    await exportCard.getByRole("button", { name: "Export Document" }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(downloadDir, await download.suggestedFilename()));
    await delay(10_000);

    log("Creating a new document.");
    await setOverlay(
      page,
      "8. Document Creation",
      "The sidebar supports inline draft creation without blocking prompts, keeping the workflow stable and easy to demo."
    );
    await page.getByRole("button", { name: "New Document" }).click();
    await page.getByLabel("Document Title").fill("Executive Brief Draft");
    await delay(3000);
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText('Created "Executive Brief Draft".').waitFor();
    await delay(9000);

    log("Recording outro.");
    await hideOverlay(page);
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: linear-gradient(135deg, #0f172a, #1e293b);
              color: #f8fafc;
              font-family: "Avenir Next", "Segoe UI", sans-serif;
            }
            .card {
              text-align: center;
              padding: 40px 48px;
              width: min(820px, calc(100vw - 80px));
              border-radius: 28px;
              background: rgba(15, 23, 42, 0.72);
              border: 1px solid rgba(148, 163, 184, 0.24);
              box-shadow: 0 24px 64px rgba(2, 6, 23, 0.45);
            }
            h1 {
              margin: 0;
              font-size: 44px;
            }
            p {
              margin: 16px 0 0;
              font-size: 20px;
              line-height: 1.7;
              color: rgba(226, 232, 240, 0.92);
            }
          </style>
        </head>
        <body>
          <section class="card">
            <h1>CollabWrite</h1>
            <p>Realtime collaboration, AI-assisted writing, version history, role-aware sharing, and export in one integrated proof of concept.</p>
          </section>
        </body>
      </html>
    `);
    await delay(7000);

    const pageVideo = page.video();
    await collaboratorContext.close();
    await primaryContext.close();
    await browser.close();
    browser = null;

    const rawVideoPath = await pageVideo.path();
    await fs.copyFile(rawVideoPath, webmOutputPath);

    log("Converting recording to MP4.");
    await runCommand("/opt/homebrew/bin/ffmpeg", [
      "-y",
      "-i",
      webmOutputPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4OutputPath
    ]);

    log(`Demo recording saved to ${mp4OutputPath}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await stopServices();
  }
}

recordDemo().catch((error) => {
  console.error(`[demo] Recording failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
