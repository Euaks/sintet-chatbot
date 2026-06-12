const fs = require("fs");
const path = require("path");

const knowledgeFilePath = path.join(__dirname, "sintet.txt");

let cachedKnowledge = null;

function normalizeText(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTextEnhanced(texto) {
  if (!texto) return "";

  let valor = String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  valor = valor.toLowerCase();
  valor = valor.replace(/[\p{P}$+<=>^`|~]/gu, " ");
  valor = valor.replace(/[^a-z0-9\s]/g, " ");
  valor = valor.replace(/\s+/g, " ").trim();

  return valor;
}

function loadKnowledgeText() {
  if (cachedKnowledge !== null) {
    return cachedKnowledge;
  }

  try {
    cachedKnowledge = fs.readFileSync(knowledgeFilePath, "utf8");
  } catch (error) {
    console.error("❌ Erro ao ler a base local:", error.message);
    cachedKnowledge = "";
  }

  return cachedKnowledge;
}

function parseSections(text) {
  const sections = {};
  const sectionRegex = /\[([^\]]+)\]\s*\n([\s\S]*?)(?=\n\[[^\]]+\]|$)/g;
  let match;

  while ((match = sectionRegex.exec(text)) !== null) {
    const key = normalizeText(match[1]);
    sections[key] = match[2].trim();
  }

  return sections;
}

const INTENCOES = require("./config/intencoes");
const FRASES = require("./config/frases");
const FRASES_INTENCOES = require("./config/frases_intencoes");
const STOPWORDS = new Set(require("./config/stopwords"));
const PESO_INTENCOES = require("./config/pesos");

const MIN_SCORE = 3;

function contarPalavras(texto) {
  const normalizado = normalizeTextEnhanced(texto);

  if (!normalizado) {
    return 0;
  }

  return normalizado.split(" ").filter(Boolean).length;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectarFrases(texto) {
  const normalizado = normalizeTextEnhanced(texto);
  const detectadas = [];

  for (const frase of FRASES) {
    const fraseNormalizada = normalizeTextEnhanced(frase);

    if (!fraseNormalizada) {
      continue;
    }

    const padrao = `\\b${escapeRegex(fraseNormalizada)}\\b`;
    const regex = new RegExp(padrao, "i");

    if (regex.test(normalizado)) {
      detectadas.push(frase);
    }
  }

  return detectadas;
}

function contarOcorrencias(texto, termo) {
  const normalizado = normalizeTextEnhanced(texto);
  const termoNormalizado = normalizeTextEnhanced(termo);

  if (!termoNormalizado) {
    return 0;
  }

  const padrao = `\\b${escapeRegex(termoNormalizado)}\\b`;
  const regex = new RegExp(padrao, "g");
  const matches = normalizado.match(regex);

  return matches ? matches.length : 0;
}

function isForaDoEscopo(texto) {
  return contarPalavras(texto) > 15;
}

function detectarIntencao(texto) {
  const pontuacoes = {};
  const frasesDetectadas = detectarFrases(texto);

  for (const intent of Object.keys(INTENCOES)) {
    let count = 0;

    for (const termo of INTENCOES[intent]) {
      count += contarOcorrencias(texto, termo);
    }

    const peso = PESO_INTENCOES[intent] || 1;
    pontuacoes[intent] = count * peso;
  }

  for (const frase of frasesDetectadas) {
    const associa = FRASES_INTENCOES[frase] || FRASES_INTENCOES[normalizeTextEnhanced(frase)];

    if (associa && Array.isArray(associa)) {
      for (const intent of associa) {
        pontuacoes[intent] = (pontuacoes[intent] || 0) + (PESO_INTENCOES[intent] || 1) * 3;
      }
    }
  }

  const intents = Object.entries(pontuacoes)
    .filter(([, score]) => score >= MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, score]) => ({ intent, score }));

  return { pontuacoes, intents, frasesDetectadas };
}

function buscarResposta(texto) {
  const textoNormalizado = normalizeTextEnhanced(texto);

  if (!textoNormalizado) {
    return null;
  }

  const temasPergunta = [
    /\bfiliac[ao]\b|\bfiliar\b/, 
    /\bbenefici|\bdireit|\bapoio|\bcarreira|\bsalario\b/, 
    /\batend|\bsuporte\b|\bajuda\b/, 
    /\bprocessos? administrativ[oa]s?\b|\bjuridic[ao]\b|\bassessoria juridic[ao]\b/
  ].filter((regex) => regex.test(textoNormalizado));

  if (temasPergunta.length >= 2) {
    return null;
  }

  const baseLocal = loadKnowledgeText();
  const secoes = parseSections(baseLocal);

  const { intents } = detectarIntencao(textoNormalizado);
  const intentsCompletas = [...intents];

  if (/\bprocessos? administrativ[oa]s?\b|\bassessoria juridic[ao]\b|\bjuridic[ao]\b/.test(textoNormalizado)) {
    intentsCompletas.push({ intent: "assessoria_juridica", score: 999 });
  }

  if (intentsCompletas.length > 0) {
    const labels = {
      horarios: "📅 Horários:",
      telefone: "📞 Telefone:",
      localizacao: "📍 Localização:",
      filiacao: "🔖 Filiação:",
      direitos: "⚖️ Direitos:",
      atendimento: "💬 Atendimento:",
      assessoria_juridica: "⚖️ Assessoria jurídica:",
      descricao: "ℹ️ Sobre:",
      saudacao: "👋 Olá:",
    };

    const partes = [];
    const vistos = new Set();

    for (const item of intentsCompletas) {
      if (vistos.has(item.intent)) {
        continue;
      }

      vistos.add(item.intent);

      const conteudo = secoes[item.intent];

      if (!conteudo) {
        continue;
      }

      const cabecalho = labels[item.intent] || `${item.intent}:`;
      partes.push(`${cabecalho}\n${conteudo}`);
    }

    if (partes.length > 0) {
      return partes.join("\n\n");
    }
  }

  if (isForaDoEscopo(textoNormalizado)) {
    return null;
  }

  if (/\b(oi|ola|bom dia|boa tarde|boa noite|menu)\b/.test(textoNormalizado)) {
    return secoes.saudacao || "Olá! Posso ajudar com informações sobre o SINTET Tocantins.";
  }

  for (const [chave, conteudo] of Object.entries(secoes)) {
    const chaveNormalizada = normalizeTextEnhanced(chave);

    if (chaveNormalizada && textoNormalizado.includes(chaveNormalizada)) {
      return conteudo;
    }
  }

  return null;
}

module.exports = {
  buscarResposta,
  normalizeText,
  isForaDoEscopo,
  fallbackMessage:
    "Não consegui identificar sua dúvida com certeza. Você pode perguntar sobre horário, telefone, localização, filiação ou falar com um atendente.",
};