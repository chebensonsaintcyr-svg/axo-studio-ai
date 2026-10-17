import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const workerSource = readFileSync("api/gemini-worker.js", "utf8");
const robotsSource = readFileSync("robots.txt", "utf8");
const sitemapSource = readFileSync("sitemap.xml", "utf8");
const wranglerSource = readFileSync("wrangler.toml", "utf8");
const deployWorkerSource = readFileSync(".github/workflows/deploy-worker.yml", "utf8");

function report(name) {
  process.stdout.write("PASS  " + name + "\n");
}

// 1. Parse all inline JavaScript in the public page before deploying.
const scriptBlocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1]))
  .map((match) => match[2])
  .filter((value) => value.trim());
assert.equal(scriptBlocks.length, 1, "Expected one inline application script.");
for (const source of scriptBlocks) {
  new vm.Script(source, { filename: "index.html inline JavaScript" });
}
report("HTML inline JavaScript syntax");

// 2. Verify core UI features stay present and key IDs are not duplicated.
for (const fragment of [
  'id="campaignForm"',
  'id="exampleBtn"',
  'id="heroExampleBtn"',
  "ETAPA 1 · CAMPANHA",
  "ETAPA 2 · DIREÇÃO CRIATIVA",
  "ETAPA 3 · VÍDEO",
  "guided-progress",
  "data-guided-target=\"#campaignStepTitle\"",
  "data-guided-target=\"#studioKitSection\"",
  "data-guided-target=\"#videoProductionSection\"",
  "Continuar para direção criativa",
  "Continuar para vídeo",
  "id=\"campaignStepTitle\"",
  "id=\"studioKitSection\"",
  "id=\"videoProductionSection\"",
  "Campanha para ",
  "Revise o texto primeiro. Depois monte o visual e o vídeo.",
  'class="copy-card"',
  'class="result-accordion"',
  "Opcional · fotos do Commons ou suas próprias",
  "class=\"result-video-step\"",
  'class="history-details"',
  "Ver campanhas salvas",
  "const THEME_STORAGE_KEY = 'axoStudioThemeV2'",
  'option value="gold">Preto e dourado',
  "html[data-theme=\"gold\"] .btn:not(.secondary)",
  "function showExampleCampaign",
  "Exemplo demonstrativo · sem chamada à IA",
  'https://axo-studio-ai-api.chebensonsaintcyr.workers.dev/',
  "https://commons.wikimedia.org/w/api.php",
  "function generateVideo",
  "new MediaRecorder(combinedStream",
  "canvas.captureStream(24)",
  "const frameCache = new Map()",
  "const frameInterval = 1000 / 24",
  "rgba(215,180,90,0.055)",
  "drawVideoFrame(ctx, d, c, elapsed, videoDuration, visualBitmaps, creditLine, frameCache)",
  'id="previewVoiceBtn"',
  'id="approveVoiceCheckbox"',
  'id="videoBtn" disabled aria-describedby="voicePreviewStatus"',
  "Ouvi a narração e aprovo exatamente esta faixa de áudio",
  "Escute a narração e marque a confirmação para liberar o vídeo.",
  "const approveVoiceCheckbox = $('approveVoiceCheckbox')",
  "const approved = Boolean(this.checked && preparedAudioBase64)",
  "if (!preparedAudioBase64 || !approveVoiceCheckbox.checked)",
  'id="buildProductionKitBtn"',
  'id="creativeLook"',
  'id="creativeMood"',
  'id="creativeTempo"',
  'id="creativeRatio"',
  'id="productionKitOutput"',
  "Prompt visual · Cena",
  "Prompt de trilha musical",
  "Plano de efeitos sonoros",
  "Prompt negativo / evitar",
  "axo-kit-producao.txt",
  "const AXO_SINGLE_VOICE_STYLE",
  "No second voice, dialogue, chorus, echo",
  "if (suppliedAudioBase64)",
  "O vídeo usará exatamente o áudio aprovado aqui.",
  "searchCommonsImages(d.product, true)",
  "function buildCommonsCredit",
  "id=\"historyList\"",
  "function getCampaignHistory",
  "function saveCampaignHistory",
  "function renderHistory",
  "localStorage.setItem(HISTORY_STORAGE_KEY",
  'id="themeSelect"',
  "function applyTheme",
  "localStorage.setItem(THEME_STORAGE_KEY",
  'value="silver"',
  'value="purple"',
  'value="light"',
  "document.documentElement.dataset.theme",
  'id="whatsappBtn"',
  "const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(campaignText)",
  'html[data-theme="light"] .output p{color:#333}',
  'rel="canonical"',
  'property="og:title"',
  '"@type": "WebSite"',
  'id="perguntas"',
  'class="feature faq-item"',
  'A AXO publica anúncios no Facebook ou Instagram?',
  'A AXO garante vendas ou clientes?'
]) {
  assert.ok(html.includes(fragment), "Missing expected site feature: " + fragment);
}
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicatedIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicatedIds)], [], "HTML contains duplicate IDs.");
assert.equal((html.match(/<script\b/gi) || []).length, (html.match(/<\/script>/gi) || []).length,
  "Script opening and closing tags must match.");
assert.ok(!/AQ\.[A-Za-z0-9_-]{20,}/.test(html), "Possible API key leaked into public HTML.");
assert.equal((html.match(/class="feature faq-item"/g) || []).length, 6,
  "The FAQ section should contain six transparent answers.");
assert.ok(!html.includes("rgba(139,92,246,0)"), "Video renderer should not use the previous purple glow style.");
assert.ok(!html.includes("rgba(196,181,253,0.16)"), "Video renderer should not use the previous decorative purple rings.");
report("Critical features, unique IDs, balanced script tags, and no exposed API-key pattern");
assert.ok(html.includes("preparedAudioBase64 = data.audioBase64"), "Previewed narration should be cached for the final render.");
assert.ok(html.includes("generateVideo(d, c, $('videoBtn'), files, commonsImages, preparedAudioBase64, preparedAudioMimeType)"),
  "The video generator should use the exact audio clip the user previewed.");
report("Video renderer uses cached scenes, a 24 fps cap, and AXO gold styling");
report("Single-speaker narration preview and reuse of the exact approved voice clip");
report("Creative production kit controls, prompts, and TXT export");
report("Organized result steps, optional image accordion, collapsible history, and default gold theme");

assert.ok(robotsSource.includes("User-agent: *"), "robots.txt should include the general crawler rule.");
assert.ok(robotsSource.includes("Sitemap: https://chebensonsaintcyr-svg.github.io/axo-studio-ai/sitemap.xml"),
  "robots.txt should reference the public sitemap.");
assert.ok(sitemapSource.includes("<urlset") && sitemapSource.includes("<loc>https://chebensonsaintcyr-svg.github.io/axo-studio-ai/</loc>"),
  "sitemap.xml should list the canonical public site URL.");
report("Search-engine files and canonical public URL");

assert.ok(wranglerSource.includes('name = "axo-studio-ai-api"'), "Wrangler config should target the existing AXO Worker.");
assert.ok(wranglerSource.includes('main = "api/gemini-worker.js"'), "Wrangler config should deploy the hardened API Worker source.");
assert.ok(deployWorkerSource.includes("workflow_dispatch:"), "Cloudflare deployment should remain manual until credentials are configured.");
assert.ok(deployWorkerSource.includes("secrets.CLOUDFLARE_API_TOKEN") && deployWorkerSource.includes("secrets.CLOUDFLARE_ACCOUNT_ID"),
  "Deployment workflow should read Cloudflare credentials from GitHub Secrets, not source code.");
report("Cloudflare Worker deploy configuration and secret-safe workflow");

// 3. Parse the Cloudflare Worker as an ES module.
const tempPath = join(tmpdir(), "axo-worker-smoke-test-" + process.pid + ".mjs");
writeFileSync(tempPath, workerSource, "utf8");
const workerModule = await import(pathToFileURL(tempPath).href + "?test=" + Date.now());
const worker = workerModule.default;
assert.ok(worker && typeof worker.fetch === "function", "Worker must export a fetch handler.");
report("Worker ES module syntax and export");
assert.ok(workerSource.includes("MAX_REQUEST_BODY_BYTES = 12_000"), "Worker should cap request body size.");
assert.ok(workerSource.includes("MAX_REQUESTS_PER_MINUTE = 5"), "Worker should enforce a conservative per-IP request limit.");
assert.ok(workerSource.includes("application/json"), "Worker should reject unsupported request content types.");
report("Worker request-size, content-type, and rate-limit safeguards");

// 4. Mock the Gemini API so tests are safe, deterministic, and do not spend API quota.
const previousFetch = globalThis.fetch;
const sampleCampaign = {
  hook: "Sua moto merece cuidado de verdade.",
  script: "Faça a revisão da sua moto com uma equipe que explica cada etapa. Peça seu orçamento hoje.",
  caption: "Mantenha sua moto em dia. Chame a Oficina Teste e peça um orçamento.",
  hashtags: ["motocicleta", "revisao"],
  scenes: [
    { time: "0–3 s", label: "GANCHO", description: "Sua moto merece cuidado de verdade.", visual: "Detalhe da moto" },
    { time: "3–10 s", label: "BENEFÍCIO", description: "Veja a importância da revisão.", visual: "Mecânico verificando a moto" },
    { time: "10–20 s", label: "AÇÃO", description: "Peça seu orçamento.", visual: "Logo e chamada para ação" }
  ]
};
let upstreamCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  upstreamCalls += 1;
  const address = String(url);
  if (address.includes("/v1beta/interactions")) {
    return new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "audio", data: Buffer.from("test-audio").toString("base64") }] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (address.includes(":generateContent")) {
    const sent = JSON.parse(options.body || "{}");
    assert.ok(sent.generationConfig?.responseSchema, "Campaign request should require a structured JSON response.");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(sampleCampaign) }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error("Unexpected upstream URL in test: " + address);
};

try {
  const origin = "https://chebensonsaintcyr-svg.github.io";
  const env = { GEMINI_API_KEY: "unit-test-secret-only" };
  const campaignRequest = () => new Request("https://test-worker.local/", {
    method: "POST",
    headers: {
      "Origin": origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "198.51.100.10"
    },
    body: JSON.stringify({
      business: "Oficina Teste",
      product: "Revisão de motos",
      audience: "Motociclistas da região",
      goal: "Gerar mensagens e pedidos de orçamento",
      tone: "Direto e convincente",
      platform: "Reels vertical 9:16"
    })
  });

  const options = await worker.fetch(new Request("https://test-worker.local/", {
    method: "OPTIONS",
    headers: { "Origin": origin }
  }), env);
  assert.equal(options.status, 204, "CORS preflight should succeed.");
  report("CORS preflight for GitHub Pages");

  const invalidOrigin = await worker.fetch(new Request("https://test-worker.local/", {
    method: "POST",
    headers: { "Origin": "https://untrusted.example", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "speech", text: "hello" })
  }), env);
  assert.equal(invalidOrigin.status, 403, "Untrusted origins should be blocked.");
  report("Untrusted origin blocked");

  const oversizedResponse = await worker.fetch(new Request("https://test-worker.local/", {
    method: "POST",
    headers: { "Origin": origin, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.12" },
    body: JSON.stringify({ payload: "x".repeat(13_000) })
  }), env);
  assert.equal(oversizedResponse.status, 413, "Oversized request bodies should be rejected before an upstream AI call.");
  report("Oversized request body rejected");

  const invalidJsonShape = await worker.fetch(new Request("https://test-worker.local/", {
    method: "POST",
    headers: { "Origin": origin, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.13" },
    body: JSON.stringify([])
  }), env);
  assert.equal(invalidJsonShape.status, 400, "A JSON array should not be accepted as a request object.");
  report("Invalid JSON object shape rejected");

  const campaignResponse = await worker.fetch(campaignRequest(), env);
  assert.equal(campaignResponse.status, 200, "Campaign endpoint should respond successfully.");
  const campaignBody = await campaignResponse.json();
  assert.equal(campaignBody.campaign.hook, sampleCampaign.hook);
  assert.equal(campaignBody.campaign.scenes.length, 3);
  report("Campaign endpoint returns normalized structured content");

  const speechResponse = await worker.fetch(new Request("https://test-worker.local/", {
    method: "POST",
    headers: {
      "Origin": origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "198.51.100.11"
    },
    body: JSON.stringify({ action: "speech", text: "Teste de narração", voice: "Kore", style: "Clear Brazilian Portuguese" })
  }), env);
  assert.equal(speechResponse.status, 200, "Speech endpoint should respond successfully.");
  const speechBody = await speechResponse.json();
  assert.equal(speechBody.audioBase64, Buffer.from("test-audio").toString("base64"));
  assert.equal(speechBody.mimeType, "audio/wav");
  report("Speech endpoint returns audio payload");

  const missingSecret = await worker.fetch(campaignRequest(), {});
  assert.equal(missingSecret.status, 503, "Missing server secret should return a clear configuration status.");
  report("Missing server secret handled without leaking details");

  assert.equal(upstreamCalls, 2, "Only campaign and speech requests should reach the mocked upstream.");
} finally {
  globalThis.fetch = previousFetch;
}
