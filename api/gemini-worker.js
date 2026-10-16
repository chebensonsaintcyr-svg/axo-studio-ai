/*
 * AXO Studio AI — Cloudflare Worker para chamadas ao Gemini.
 *
 * IMPORTANTE:
 * - Configure GEMINI_API_KEY como Secret no painel Cloudflare Workers.
 * - Nunca coloque a chave no HTML, JavaScript público ou GitHub.
 * - O limite por IP deste arquivo é apenas uma proteção básica em memória.
 *   Antes de abrir o serviço ao público, adicione Cloudflare Turnstile e/ou
 *   limitação persistente de requisições.
 */

const ALLOWED_ORIGIN = "https://chebensonsaintcyr-svg.github.io";
const MODEL = "gemini-3.8-flash";
const MAX_REQUESTS_PER_MINUTE = 8;
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

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return jsonResponse({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, 429, origin);
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return jsonResponse({ error: "O pedido precisa estar em formato JSON." }, 400, origin);
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
            temperature: 0.75,
            maxOutputTokens: 1400,
            responseMimeType: "application/json",
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

    try {
      const campaign = JSON.parse(text);
      if (!campaign.hook || !campaign.script || !campaign.caption || !Array.isArray(campaign.scenes)) {
        throw new Error("Resposta incompleta");
      }
      return jsonResponse({ campaign }, 200, origin);
    } catch {
      return jsonResponse({ error: "A IA gerou uma resposta que não conseguimos ler. Tente novamente." }, 502, origin);
    }
  },
};
