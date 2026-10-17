/*
 * AXO Studio AI — Cloudflare Worker para chamadas ao Gemini.
 *
 * IMPORTANTE:
 * - Configure GEMINI_API_KEY como Secret no painel Cloudflare Workers.
 * - Nunca coloque a chave no HTML, JavaScript público ou GitHub.
 * - Há limites básicos em memória e tamanho máximo de requisição.
 * - Para proteção consistente entre instâncias, configure Cloudflare Rate Limiting
 *   e Turnstile no painel antes de escalar o serviço.
 */

const ALLOWED_ORIGIN = "https://chebensonsaintcyr-svg.github.io";
const MODEL = "gemini-3.8-flash";
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_REQUEST_BODY_BYTES = 12_000;
const ipBuckets = new Map();

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isAllowedOrigin(origin) {
  return origin === ALLOWED_ORIGIN;
}

function rateLimited(ip) {
  const now = Date.now();
  const old = ipBuckets.get(ip);
  if (!old || now - old.startedAt >= 60_000) {
    ipBuckets.set(ip, { startedAt: now, count: 1 });
    if (ipBuckets.size > 2000) {
      for (const [key, value] of ipBuckets) {
        if (now - value.startedAt >= 60_000) ipBuckets.delete(key);
      }
    }
    return false;
  }
  old.count += 1;
  return old.count > MAX_REQUESTS_PER_MINUTE;
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!isAllowedOrigin(origin)) {
      return jsonResponse({ error: "Origem não autorizada." }, 403, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST para gerar uma campanha." }, 405, origin);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: "A chave de IA ainda não foi configurada no servidor." }, 503, origin);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ error: "Envie o pedido no formato JSON." }, 415, origin);
    }

    const declaredLength = Number(request.headers.get("Content-Length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
      return jsonResponse({ error: "O pedido é muito grande. Reduza o texto e tente novamente." }, 413, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return jsonResponse({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, 429, origin);
    }

    let input;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
        return jsonResponse({ error: "O pedido é muito grande. Reduza o texto e tente novamente." }, 413, origin);
      }
      input = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "O pedido precisa estar em formato JSON válido." }, 400, origin);
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return jsonResponse({ error: "O pedido precisa conter um objeto JSON." }, 400, origin);
    }

    if (input.action === "speech") {
      const speechText = cleanString(input.text, 1200);
      const requestedVoice = cleanString(input.voice, 32);
      const allowedVoices = new Set(["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"]);
      const voice = allowedVoices.has(requestedVoice) ? requestedVoice : "Kore";
      const style = cleanString(input.style, 180) || "Warm, confident, clear advertising narration in natural Brazilian Portuguese, medium pace.";
      if (!speechText) {
        return jsonResponse({ error: "Não há texto para narrar." }, 400, origin);
      }

      let speechResponse;
      try {
        speechResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            model: "gemini-3.8-flash-tts",
            input: [{
              type: "user_input",
              content: [{
                type: "text",
                text: speechText,
                annotations: [{
                  type: "speech_metadata",
                  style,
                }],
              }],
            }],
            response_format: { type: "audio" },
            generation_config: {
              speech_config: [{ voice }],
            },
          }),
        });
      } catch {
        return jsonResponse({ error: "Não foi possível conectar ao serviço de voz. Tente novamente." }, 502, origin);
      }

      if (!speechResponse.ok) {
        const status = speechResponse.status === 429 ? 429 : 502;
        const message = speechResponse.status === 429
          ? "A voz IA atingiu um limite temporário. Aguarde e tente novamente."
          : "O serviço de voz não conseguiu gerar a narração. Confira a chave Gemini e tente novamente.";
        return jsonResponse({ error: message }, status, origin);
      }

      let speechData;
      try {
        speechData = await speechResponse.json();
      } catch {
        return jsonResponse({ error: "O serviço de voz retornou uma resposta inválida." }, 502, origin);
      }

      const audioPart = (speechData?.steps || [])
        .filter((step) => step.type === "model_output")
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === "audio" && part.data)
        .at(-1);
      const audioBase64 = audioPart?.data || speechData?.output_audio?.data;

      if (!audioBase64) {
        return jsonResponse({ error: "A voz IA não retornou áudio. Tente novamente." }, 502, origin);
      }

      return jsonResponse({ audioBase64, mimeType: "audio/wav" }, 200, origin);
    }

    const business = cleanString(input.business, 90);
    const product = cleanString(input.product, 700);
    const audience = cleanString(input.audience, 180);
    const goal = cleanString(input.goal, 160);
    const tone = cleanString(input.tone, 100);
    const platform = cleanString(input.platform, 100);

    if (!business || !product || !audience || !goal || !tone || !platform) {
      return jsonResponse({ error: "Preencha a marca, o produto, o público, o objetivo, o estilo e o formato." }, 400, origin);
    }

    const prompt = `Você é o redator publicitário da AXO Studio AI e cria campanhas em português brasileiro natural.
Crie uma campanha concreta e útil usando somente os dados fornecidos. Não invente preço, desconto, garantia, depoimentos, resultados ou características não informadas.
Use linguagem adequada ao público; mantenha o texto natural, sem erros ou expressões genéricas. A chamada para ação deve combinar com o objetivo. Se o objetivo for receber mensagens/orçamentos, convide claramente a pessoa a chamar no WhatsApp/direct ou pedir orçamento, sem inventar um número.
Retorne somente JSON válido com estas propriedades:
{
  "hook": "gancho curto para os primeiros 3 segundos",
  "script": "roteiro completo e natural de 15 a 30 segundos",
  "caption": "legenda pronta para publicar",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "scenes": [
    {"time":"0–3 s","label":"GANCHO","description":"texto/narração dessa parte","visual":"sugestão visual concreta"},
    {"time":"3–10 s","label":"BENEFÍCIO","description":"texto/narração dessa parte","visual":"sugestão visual concreta"},
    {"time":"10–20 s","label":"AÇÃO","description":"texto/narração dessa parte","visual":"sugestão visual concreta"}
  ]
}
Dados da campanha:
Marca: ${business}
Produto/serviço: ${product}
Público-alvo: ${audience}
Objetivo: ${goal}
Tom: ${tone}
Formato: ${platform}
Escreva para uma empresa real local. Evite a palavra "joven" se não estiver correta; use o público informado de modo natural.`;

    let upstream;
    try {
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1800,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                hook: { type: "STRING" },
                script: { type: "STRING" },
                caption: { type: "STRING" },
                hashtags: { type: "ARRAY", items: { type: "STRING" } },
                scenes: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      time: { type: "STRING" },
                      label: { type: "STRING" },
                      description: { type: "STRING" },
                      visual: { type: "STRING" }
                    },
                    required: ["time", "label", "description", "visual"]
                  }
                }
              },
              required: ["hook", "script", "caption", "hashtags", "scenes"]
            }
          },
        }),
      });
    } catch {
      return jsonResponse({ error: "Não foi possível conectar ao serviço de IA. Tente novamente." }, 502, origin);
    }

    if (!upstream.ok) {
      // Do not send upstream response details or credentials back to the visitor.
      const status = upstream.status === 429 ? 429 : 502;
      const message = upstream.status === 429
        ? "A IA atingiu um limite temporário. Aguarde e tente novamente."
        : "O serviço de IA não conseguiu gerar a campanha. Confira a chave e tente novamente.";
      return jsonResponse({ error: message }, status, origin);
    }

    let upstreamData;
    try {
      upstreamData = await upstream.json();
    } catch {
      return jsonResponse({ error: "A resposta da IA veio em formato inesperado." }, 502, origin);
    }

    const text = upstreamData?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      return jsonResponse({ error: "A IA não retornou texto. Tente novamente." }, 502, origin);
    }

    // Models may occasionally wrap JSON in Markdown fences or vary field names.
    // Normalize those small differences instead of failing the whole request.
    function parseJsonResponse(rawText) {
      const variants = [
        String(rawText || "").trim(),
        String(rawText || "").trim()
          .replace(/^\uFEFF/, "")
          .replace(/^\s*```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim()
      ];
      for (const candidate of variants) {
        try { return JSON.parse(candidate); } catch {}
        const first = candidate.indexOf("{");
        const last = candidate.lastIndexOf("}");
        if (first >= 0 && last > first) {
          try { return JSON.parse(candidate.slice(first, last + 1)); } catch {}
        }
      }
      return null;
    }

    const parsed = parseJsonResponse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({
        error: "A IA respondeu em um formato inesperado. Tente gerar novamente; se persistir, confira a configuração do modelo."
      }, 502, origin);
    }

    const hook = cleanString(
      parsed.hook || parsed.gancho || parsed.hook_inicial || parsed.opening_hook,
      500
    );
    const script = cleanString(
      parsed.script || parsed.roteiro || parsed.video_script || parsed.voiceover || parsed.narration,
      3500
    );
    const caption = cleanString(
      parsed.caption || parsed.legenda || parsed.ad_copy || parsed.texto_anuncio,
      1800
    );
    const tagsValue = parsed.hashtags || parsed.tags || parsed.hashtags_sugeridas;
    const hashtags = Array.isArray(tagsValue)
      ? tagsValue.map((tag) => cleanString(String(tag), 60)).filter(Boolean).slice(0, 12)
      : [];

    const rawScenes = parsed.scenes || parsed.cenas || parsed.scene_plan || parsed.plano_de_cenas;
    let scenes = Array.isArray(rawScenes) ? rawScenes.map((scene, index) => ({
      time: cleanString(scene?.time || scene?.tempo || scene?.duration, 40) || ["0–3 s", "3–10 s", "10–20 s"][Math.min(index, 2)],
      label: cleanString(scene?.label || scene?.title || scene?.titulo || scene?.etapa, 80) || ["GANCHO", "BENEFÍCIO", "AÇÃO"][Math.min(index, 2)],
      description: cleanString(scene?.description || scene?.narration || scene?.text || scene?.texto || scene?.descricao, 800),
      visual: cleanString(scene?.visual || scene?.visual_suggestion || scene?.suggested_visual || scene?.visual_sugerido, 500),
    })).filter((scene) => scene.description || scene.visual).slice(0, 8) : [];

    if (!hook || !script || !caption) {
      // Some output formats may return the copy in another top-level field.
      const combined = cleanString(parsed.text || parsed.content || parsed.campanha || parsed.ad, 3000);
      if (!script && combined) {
        return jsonResponse({
          error: "A IA retornou uma campanha em formato diferente do esperado. Tente novamente."
        }, 502, origin);
      }
      return jsonResponse({
        error: "A resposta da IA veio incompleta. Tente gerar novamente."
      }, 502, origin);
    }

    if (scenes.length === 0) {
      scenes = [
        { time: "0–3 s", label: "GANCHO", description: hook, visual: "Abra com uma cena que mostre o produto ou o problema do público." },
        { time: "3–10 s", label: "BENEFÍCIO", description: script, visual: "Mostre o produto ou serviço em uso e destaque um benefício real." },
        { time: "10–20 s", label: "AÇÃO", description: caption, visual: "Finalize com a marca e a chamada para ação." },
      ];
    }

    return jsonResponse({
      campaign: { hook, script, caption, hashtags, scenes }
    }, 200, origin);
  },
};
