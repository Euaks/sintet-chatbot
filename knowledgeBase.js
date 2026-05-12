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

// carregar configs externas
const INTENCOES = require("./config/intencoes");
const FRASES = require("./config/frases");
const FRASES_INTENCOES = require("./config/frases_intencoes");
const STOPWORDS = new Set(require("./config/stopwords"));
const PESO_INTENCOES = require("./config/pesos");

// limiar mínimo de confiança para retornar uma resposta local
const MIN_SCORE = 2;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTextEnhanced(texto) {
  if (!texto) return "";
  let t = String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.toLowerCase();
  // remove pontuação
  t = t.replace(/[\p{P}$+<=>^`|~]/gu, " ");
  // remove caracteres extras e números isolados
  t = t.replace(/[^a-z0-9\s]/g, " ");
  // espaços duplicados
  t = t.replace(/\s+/g, " ").trim();
  // remover stopwords simples
  const parts = t.split(" ").filter((w) => !STOPWORDS.has(w));
  return parts.join(" ");
}

function isForaDoEscopo(texto) {
  const t = normalizeTextEnhanced(texto);
  if (!t) return true;

  const termosGlobais = [
    "brasil",
    "geral",
    "mundo",
    "todos os sindicatos",
    "outros sindicatos",
    "historia dos sindicatos",
    "leis do brasil",
    "legislacao geral",
  ];

  const mencionaSintet = t.includes("sintet");
  const mencionaServicoLocal =
    t.includes("atendimento") ||
    t.includes("filiacao") ||
    t.includes("telefone") ||
    t.includes("horario") ||
    t.includes("horarios") ||
    t.includes("endereco") ||
    t.includes("localizacao") ||
    t.includes("sindicato");

  const temTermoGlobal = termosGlobais.some((termo) => t.includes(normalizeTextEnhanced(termo)));

  if (temTermoGlobal && !mencionaSintet && !mencionaServicoLocal) {
    return true;
  }

  if (temTermoGlobal && mencionaServicoLocal && !mencionaSintet) {
    return true;
  }

  return false;
}

function detectFrases(texto) {
  const t = normalizeTextEnhanced(texto);
  const detectadas = [];
  for (const f of FRASES) {
    const nf = normalizeTextEnhanced(f);
    if (!nf) continue;
    const pattern = `\\b${escapeRegex(nf)}\\b`;
    const re = new RegExp(pattern, "i");
    if (re.test(t)) detectadas.push(f);
  }
  return detectadas;
}

function countOccurrences(text, keyword) {
  const t = normalizeTextEnhanced(text);
  const k = normalizeTextEnhanced(keyword);
  if (!k) return 0;
  // contar ocorrências de frases maiores primeiro
  const pattern = `\\b${escapeRegex(k)}\\b`;
  const re = new RegExp(pattern, "g");
  const matches = t.match(re);
  return matches ? matches.length : 0;
}

function detectarIntencao(texto) {
  const t = normalizeTextEnhanced(texto);
  const frasesDetectadas = detectFrases(texto);
  const pontuacoes = {};
  const countsRaw = {};

  for (const intent of Object.keys(INTENCOES)) {
    let count = 0;
    // contar frases/expressões da lista da intenção
    for (const chave of INTENCOES[intent]) {
      count += countOccurrences(t, chave);
    }
    countsRaw[intent] = count;
    const peso = PESO_INTENCOES[intent] || 1;
    pontuacoes[intent] = count * peso;
  }

  // se encontrar frases específicas, aumente a pontuação das intenções associadas
  for (const f of frasesDetectadas) {
    const nf = normalizeTextEnhanced(f);
    const associa = FRASES_INTENCOES[f] || FRASES_INTENCOES[nf];
    if (associa && Array.isArray(associa)) {
      for (const intent of associa) {
        pontuacoes[intent] = (pontuacoes[intent] || 0) + (PESO_INTENCOES[intent] || 1) * 3;
      }
    }
  }

  // heurísticas simples de contexto
  if (t.includes("lei") || t.includes("trabalhista")) {
    pontuacoes.direitos = (pontuacoes.direitos || 0) + (PESO_INTENCOES.direitos || 2) * 3;
  }
  if (t.includes("historia") || t.includes("sobre")) {
    pontuacoes.descricao = (pontuacoes.descricao || 0) + (PESO_INTENCOES.descricao || 2) * 3;
  }

  // construir lista de intenções com score > 0
  const intentsList = Object.entries(pontuacoes)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]) // ordenar por score desc
    .map(([intent, score]) => ({ intent, score }));

  return { pontuacoes, intents: intentsList, frasesDetectadas };
}

function buscarResposta(texto) {
  const textoNormalizado = normalizeTextEnhanced(texto);
  if (!textoNormalizado) return null;

  if (isForaDoEscopo(texto)) {
    return null;
  }

  const baseLocal = loadKnowledgeText();
  const secoes = parseSections(baseLocal);

  // resposta de saudacao/menu (checar variações sem stopwords)
  if (/\b(oi|ola|bom dia|boa tarde|boa noite|menu)\b/.test(textoNormalizado)) {
    return secoes.saudacao || "Olá! Posso ajudar com informações sobre o SINTET Tocantins.";
  }

  // detectar múltiplas intenções
  const { pontuacoes, intents, frasesDetectadas } = detectarIntencao(textoNormalizado);

  // filtrar por score mínimo e limitar número de intenções
  const intentsFiltradas = (intents || []).filter((it) => it.score >= MIN_SCORE).slice(0, 3);

  if (intentsFiltradas.length > 0) {
    const LABELS = {
      horarios: "📅 Horários:",
      telefone: "📞 Telefone:",
      localizacao: "📍 Localização:",
      filiacao: "🔖 Filiação:",
      direitos: "⚖️ Direitos:",
      atendimento: "💬 Atendimento:",
      descricao: "ℹ️ Sobre:",
      saudacao: "👋 Olá:",
    };

    const partes = [];
    const vistos = new Set();

    for (const it of intentsFiltradas) {
      const chave = it.intent;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const conteudo = secoes[chave];
      if (!conteudo) continue;
      const header = LABELS[chave] || `${chave}:`;
      partes.push(`${header}\n${conteudo}`);
    }

    if (partes.length > 0) {
      return partes.join("\n\n");
    }
  }

  // fallback por includes() nas seções (busca direta por título de seção)
  for (const [key, value] of Object.entries(secoes)) {
    const k = normalizeTextEnhanced(key);
    if (textoNormalizado.includes(k)) {
      return value;
    }
  }
  // tentativa de fallback parcial: comparação de conteúdo das seções
  const textoTokens = new Set(normalizeTextEnhanced(texto).split(" ").filter(Boolean));
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, value] of Object.entries(secoes)) {
    const contentTokens = new Set(normalizeTextEnhanced(value).split(" ").filter(Boolean));
    let common = 0;
    for (const tok of textoTokens) {
      if (contentTokens.has(tok)) common++;
    }
    if (common > bestScore) {
      bestScore = common;
      bestMatch = { key, value, score: common };
    }
  }

  // se houver match parcial relevante (>=2 tokens em comum), retornar a seção correspondente
  if (bestMatch && bestMatch.score >= 2) {
    return bestMatch.value;
  }

  // heurística geral: perguntas sobre sindicato/educacao -> retornar descricao
  const geralKeys = ["sindicato", "educacao", "trabalhadores", "trabalhista"];
  for (const g of geralKeys) {
    if (textoNormalizado.includes(g)) {
      if (secoes.descricao) return secoes.descricao;
    }
  }

  // sem resposta local confiável -> retornar null para IA assumir
  return null;
}

module.exports = {
  buscarResposta,
  normalizeText,
  isForaDoEscopo,
  fallbackMessage:
    "Não consegui identificar sua dúvida com certeza. Você pode perguntar sobre horário, telefone, localização, filiação ou falar com um atendente.",
};