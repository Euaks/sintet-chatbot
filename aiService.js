require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Instruções de comportamento da Persona
const systemInstruction = [
  "Você é um atendente virtual do SINTET Tocantins.",
  "Responda em português do Brasil, de forma prestativa e objetiva. Resuma a resposta em até 3 frases curtas e objetivas, cobrindo todos os pontos; se necessário, use até 5 itens curtos numerados.",
  "Baseie suas respostas estritamente nas informações fornecidas.",
  "- Responda TODOS os pontos da pergunta - Não omita informações relevantes",
  "Se não tiver segurança ou não encontrar a resposta nos dados, oriente o usuário de forma gentil a falar com um atendente humano.",
].join(" ");

const gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;

const historicoPorSessao = new Map();
// Reduzido levemente para otimizar o consumo de saldo sem perder a linha de raciocínio
const LIMITE_HISTORICO = 6; 

function limitarTexto(texto, limite) {
  const valor = String(texto || "").trim();
  if (valor.length <= limite) return valor;
  return `${valor.slice(0, limite).trim()}...`;
}

function estimarTokensTexto(texto) {
  const valor = String(texto || "").trim();
  if (!valor) return 0;
  return Math.ceil(valor.length / 4);
}

function resumirRespostaCurta(texto, maxSentences = 3, maxBullets = 5) {
  if (!texto) return texto;

  // Se já for curto, retorna como está
  if (texto.length <= 400) return texto.trim();

  // Preferir bullets numerados caso existam
  const bullets = texto.split(/\n\s*[-•\*\d]+\s*/).map((s) => s.trim()).filter(Boolean);
  if (bullets.length > 1) {
    return bullets.slice(0, Math.min(bullets.length, maxBullets)).join("\n");
  }

  // Caso contrário, pegar até N sentenças completas
  const partes = texto.split(/(?<=[.!?])\s+/);
  if (partes.length <= maxSentences) return texto.trim();
  return partes.slice(0, maxSentences).join(" ").trim();
}

function estimarTokensHistorico(historico) {
  return (historico || []).reduce((total, mensagem) => {
    const partes = Array.isArray(mensagem?.parts) ? mensagem.parts : [];
    const textoMensagem = partes
      .map((parte) => parte?.text || "")
      .join(" ");
    return total + estimarTokensTexto(textoMensagem);
  }, 0);
}

function montarTextoCompletoEntrada(historico, pergunta) {
  return [
    ...(historico || []).map((mensagem) =>
      (Array.isArray(mensagem?.parts) ? mensagem.parts : [])
        .map((parte) => parte?.text || "")
        .join(" ")
    ),
    pergunta,
  ].join(" ");
}

function registrarUsoTokens({ entrada, historico, saida, total }) {
  console.log("[USO DE TOKENS]");
  console.log(`Entrada: ${entrada}`);
  console.log(`Histórico: ${historico}`);
  console.log(`Saída: ${saida}`);
  console.log(`Total: ${total}`);
}

function obterHistoricoSessao(sessionId) {
  const chave = String(sessionId || "default");
  return historicoPorSessao.get(chave) || [];
}

function salvarHistoricoSessao(sessionId, historico) {
  const chave = String(sessionId || "default");
  // Garante que o histórico não estoure o limite de tamanho definido
  const historicoRecente = historico.slice(-LIMITE_HISTORICO);
  historicoPorSessao.set(chave, historicoRecente);
}

async function gerarRespostaIA(texto, sessionId = "default", opcoes = {}) {
  if (!gemini) {
    console.warn("⚠️ GEMINI_API_KEY não configurada. IA desativada.");
    return null;
  }

  const limiteEntrada = Number.isFinite(opcoes.inputLimit) ? opcoes.inputLimit : 6000;
  const pergunta = limitarTexto(texto, limiteEntrada);
  if (!pergunta) return null;

  try {
    const historico = obterHistoricoSessao(sessionId);
    const systemInstructionFinal = `
${systemInstruction}

${opcoes.systemInstruction || ""}
`.trim();
    const temperatura = Number.isFinite(opcoes.temperature) ? opcoes.temperature : 0.3;
    let maxOutputTokens = Number.isFinite(opcoes.maxOutputTokens) ? opcoes.maxOutputTokens : 1200;

    // Preparação da estrutura de conteúdos exigida pelo SDK
    const contents = [
      ...historico,
      {
        role: "user",
        parts: [{ text: pergunta }],
      },
    ];

    // Tentaremos gerar a resposta, com retry automático caso seja detectado truncamento
    let resposta = null;
    let usoMetadata = null;
    let respostaFinal = null;
    let lastCandidateMeta = null;

    let respostaCompleta = false;

    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      try {
        resposta = await gemini.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: systemInstructionFinal,
            temperature: temperatura,
            maxOutputTokens,
          },
        });
      } catch (err) {
        console.error("❌ Erro na chamada ao Gemini (tentativa):", err?.message || err);
        break;
      }

      usoMetadata = resposta?.usageMetadata;
      const candidate = resposta?.candidates?.[0];
      lastCandidateMeta = candidate?.metadata || candidate || {};

      respostaFinal =
        candidate?.content?.parts?.map((p) => p.text || "").join("").trim() || null;

      // Detecta possíveis sinais de truncagem
      const finishReason = (lastCandidateMeta?.finishReason || lastCandidateMeta?.finish_reason || "").toString().toLowerCase();
      const tokensGerados = usoMetadata?.candidatesTokenCount ?? (lastCandidateMeta?.tokenCount || 0);
      const truncadoPorTokens = Number.isFinite(tokensGerados) && tokensGerados >= (maxOutputTokens - 5);
      const motivoTruncagem = finishReason.includes("max") || finishReason.includes("length") || truncadoPorTokens;

      if (respostaFinal && !motivoTruncagem) {
        respostaCompleta = true;
        break; // boa resposta
      }

      // Se chegou aqui, pode ter sido truncada: tenta novamente com maior limite
      if (tentativa === 0) {
        const novoMax = Math.min(maxOutputTokens * 2, 2000);
        console.warn("⚠️ Resposta possivelmente truncada (finishReason=", finishReason, ", tokens=", tokensGerados, "). Retentando com maxOutputTokens=", novoMax);
        maxOutputTokens = novoMax;
        respostaFinal = null;
        // loop continuará e fará nova chamada
        continue;
      }

      // última tentativa falhou em produzir resposta completa
      break;
    }

    if (!respostaCompleta) return null;

    const tokensHistorico = estimarTokensHistorico(historico);
    const textoCompletoEntrada = montarTextoCompletoEntrada(historico, pergunta);
    const tokensEntradaReal = estimarTokensTexto(textoCompletoEntrada);

    // Prefer usageMetadata vindo da última resposta, se houver
    const usageMetadata = usoMetadata;

    if (usageMetadata) {
      registrarUsoTokens({
        entrada: usageMetadata.promptTokenCount ?? tokensEntradaReal,
        historico: tokensHistorico,
        saida: usageMetadata.candidatesTokenCount ?? 0,
        total:
          usageMetadata.totalTokenCount ?? (usageMetadata.promptTokenCount ?? tokensEntradaReal) + (usageMetadata.candidatesTokenCount ?? 0),
      });
    } else {
      const tokensSaida = estimarTokensTexto(respostaFinal);

      registrarUsoTokens({
        entrada: tokensEntradaReal,
        historico: tokensHistorico,
        saida: tokensSaida,
        total: tokensEntradaReal + tokensHistorico + tokensSaida,
      });
    }

    // Log adicional para ajudar a diagnosticar cortes
    if (lastCandidateMeta) {
      console.log("[Gemini candidate metadata]:", JSON.stringify(lastCandidateMeta));
    }

    // Pós-processamento para respostas mais curtas quando solicitado
    try {
      respostaFinal = resumirRespostaCurta(respostaFinal, 3, 5);
    } catch (e) {
      console.warn("⚠️ Falha ao resumir resposta:", e?.message || e);
    }

    // Salva a interação atual na memória da sessão
    salvarHistoricoSessao(sessionId, [
      ...historico,
      {
        role: "user",
        parts: [{ text: pergunta }],
      },
      {
        role: "model",
        parts: [{ text: respostaFinal }],
      },
    ]);

    return respostaFinal;
  } catch (error) {
    console.error("❌ Erro ao gerar resposta com Gemini:", error?.message || error);
    return null;
  }
}

function limparHistoricoSessao(sessionId) {
  const chave = String(sessionId || "default");
  historicoPorSessao.delete(chave);
}

module.exports = {
  gerarRespostaIA,
  limparHistoricoSessao,
};
