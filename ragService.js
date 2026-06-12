const fs = require("fs");
const path = require("path");

const { buscarResposta } = require("./knowledgeBase");
const { gerarRespostaIA } = require("./aiService");
const STOPWORDS = new Set(require("./config/stopwords"));

const arquivoRAGPath = path.join(__dirname, "teste_sintet.txt");

let cacheTextoRAG = null;
let cacheChunksRAG = null;

function extrairSecoesDoTexto(texto) {
  const secoes = {};
  const regex = /\[([^\]]+)\]\s*\n([\s\S]*?)(?=\n\[[^\]]+\]|$)/g;
  let match;

  while ((match = regex.exec(String(texto || ""))) !== null) {
    const chave = normalizarTextoBusca(match[1]);
    secoes[chave] = match[2].trim();
  }

  return secoes;
}

function montarRespostaFallback(pergunta) {
  const texto = carregarTextoRAG();
  const secoes = extrairSecoesDoTexto(texto);
  const perguntaNormalizada = normalizarTextoBusca(pergunta);
  const partes = [];

  const incluir = (chave, titulo) => {
    const conteudo = secoes[chave];
    if (conteudo) {
      partes.push(`${titulo}\n${conteudo}`);
    }
  };

  if (/\bfili|\bcadastro|\bentrar\b/.test(perguntaNormalizada)) {
    incluir("filiacao", "🔖 Filiação:");
  }

  if (/\bbenefi|\bdireit|\bapoio|\btrabalho|\bcarreira|\bsalario\b/.test(perguntaNormalizada)) {
    incluir("direitos", "⚖️ Direitos:");
  }

  if (/\batend|\bsuporte\b|\bajuda\b/.test(perguntaNormalizada)) {
    incluir("atendimento", "💬 Atendimento:");
  }

  if (/\bprocessos? administrativ[oa]s?\b|\bjuridic[ao]\b|\bassessoria juridic[ao]\b/.test(perguntaNormalizada)) {
    incluir("assessoria_juridica", "⚖️ Assessoria jurídica:");
  }

  if (partes.length > 0) {
    return partes.join("\n\n");
  }

  return null;
}

function normalizarTextoBusca(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function carregarTextoRAG() {
  if (cacheTextoRAG !== null) {
    return cacheTextoRAG;
  }

  try {
    cacheTextoRAG = fs.readFileSync(arquivoRAGPath, "utf8");
  } catch (error) {
    console.error("❌ Erro ao ler teste_sintet.txt:", error.message);
    cacheTextoRAG = "";
  }

  return cacheTextoRAG;
}

function quebrarTextoSeguro(texto, limiteMaximo) {
  if (texto.length <= limiteMaximo) {
    return [texto.trim()].filter(Boolean);
  }

  const pontoCorte = Math.max(
    texto.lastIndexOf("\n", limiteMaximo),
    texto.lastIndexOf(". ", limiteMaximo),
    texto.lastIndexOf("! ", limiteMaximo),
    texto.lastIndexOf("? ", limiteMaximo),
    texto.lastIndexOf("; ", limiteMaximo),
    texto.lastIndexOf(", ", limiteMaximo),
    texto.lastIndexOf(" ", limiteMaximo)
  );

  const indiceCorte = pontoCorte > 0 ? pontoCorte : limiteMaximo;
  const parteAtual = texto.slice(0, indiceCorte).trim();
  const restante = texto.slice(indiceCorte).trim();

  if (!restante) {
    return [parteAtual].filter(Boolean);
  }

  return [parteAtual, ...quebrarTextoSeguro(restante, limiteMaximo)];
}

function dividirEmChunks(texto, tamanhoMinimo = 500, tamanhoMaximo = 1000) {
  const conteudo = String(texto || "").trim();

  if (!conteudo) {
    return [];
  }

  const paragrafos = conteudo
    .split(/\n\s*\n+/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean);

  const chunks = [];
  let acumulado = "";

  const adicionarChunk = (trecho) => {
    const limpo = String(trecho || "").trim();
    if (limpo) {
      chunks.push(limpo);
    }
  };

  for (const paragrafo of paragrafos) {
    if (paragrafo.length > tamanhoMaximo) {
      if (acumulado) {
        adicionarChunk(acumulado);
        acumulado = "";
      }

      const partes = paragrafo
        .split(/(?<=[.!?])\s+/)
        .map((parte) => parte.trim())
        .filter(Boolean);

      for (const parte of partes.length > 0 ? partes : quebrarTextoSeguro(paragrafo, tamanhoMaximo)) {
        if (parte.length <= tamanhoMaximo) {
          adicionarChunk(parte);
        } else {
          for (const subParte of quebrarTextoSeguro(parte, tamanhoMaximo)) {
            adicionarChunk(subParte);
          }
        }
      }

      continue;
    }

    const candidato = acumulado ? `${acumulado}\n\n${paragrafo}` : paragrafo;

    if (candidato.length <= tamanhoMaximo) {
      acumulado = candidato;
      continue;
    }

    if (acumulado.length >= tamanhoMinimo) {
      adicionarChunk(acumulado);
      acumulado = paragrafo;
      continue;
    }

    const partes = quebrarTextoSeguro(candidato, tamanhoMaximo);
    for (let i = 0; i < partes.length; i += 1) {
      const parte = partes[i];
      if (i === partes.length - 1) {
        acumulado = parte;
      } else {
        adicionarChunk(parte);
      }
    }
  }

  if (acumulado) {
    adicionarChunk(acumulado);
  }

  return chunks;
}

function obterChunksCache() {
  if (cacheChunksRAG !== null) {
    return cacheChunksRAG;
  }

  const texto = carregarTextoRAG();
  cacheChunksRAG = dividirEmChunks(texto);

  return cacheChunksRAG;
}

function extrairPalavrasChave(pergunta) {
  const normalizado = normalizarTextoBusca(pergunta);

  if (!normalizado) {
    return [];
  }

  const palavras = normalizado
    .split(" ")
    .map((palavra) => palavra.trim())
    .filter((palavra) => palavra.length >= 3 && !STOPWORDS.has(palavra));

  return [...new Set(palavras)];
}

function pontuarChunk(chunk, palavrasChave) {
  if (!chunk || palavrasChave.length === 0) {
    return 0;
  }

  const chunkNormalizado = normalizarTextoBusca(chunk);
  let score = 0;

  for (const palavra of palavrasChave) {
    const regex = new RegExp(`\\b${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const correspondencias = chunkNormalizado.match(regex);

    if (correspondencias) {
      score += correspondencias.length;
    }
  }

  return score;
}

function buscarChunksRelevantes(pergunta, quantidade = 5) {
  const palavrasChave = extrairPalavrasChave(pergunta);

  if (palavrasChave.length === 0) {
    return [];
  }

  const chunks = obterChunksCache();

  return chunks
    .map((chunk, indice) => ({
      chunk,
      indice,
      score: pontuarChunk(chunk, palavrasChave),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.indice - b.indice)
    .slice(0, quantidade)
    .map((item) => item.chunk);
}

function montarPromptRAG(pergunta, chunksRelevantes) {
  const contexto = chunksRelevantes
    .map((chunk, indice) => `Trecho ${indice + 1}:\n${chunk}`)
    .join("\n\n---\n\n");

  return [
    "CONTEXTO:",
    contexto || "Nenhum trecho relevante foi encontrado.",
    "",
    "PERGUNTA:",
    String(pergunta || "").trim(),
    "",
    "REGRAS:",
    "Responda apenas com base no contexto fornecido.",
    "",
    "Analise a pergunta e identifique todos os pontos ou intenções presentes.",
    "Responda todos eles de forma completa.",
    "",
    "Não omita informações relevantes.",
    "Se a pergunta tiver múltiplas partes, responda todas de forma organizada.",
    "",
    "Se alguma informação não estiver no contexto, diga claramente que não encontrou.",
    "",
    "Seja claro, completo e em português do Brasil.",
  ].join("\n");
}

function respostaIndicaIncerteza(resposta) {
  const texto = normalizarTextoBusca(resposta);

  return [
    "nao possuo essa informacao",
    "nao tenho essa informacao",
    "nao encontrei essa informacao",
    "nao encontrei no contexto",
    "nao tenho certeza",
    "nao sei informar",
    "falar com um atendente",
  ].some((frase) => texto.includes(frase));
}

async function responderComRAG(pergunta, sessionId = "default") {
  const chunksRelevantes = buscarChunksRelevantes(pergunta, 3);

  if (chunksRelevantes.length === 0) {
    return null;
  }

  const prompt = montarPromptRAG(pergunta, chunksRelevantes);
  const respostaIA = await gerarRespostaIA(prompt, sessionId, {
    inputLimit: 6000,
    temperature: 0.2,
    maxOutputTokens: 400,
    systemInstruction:
      "Você responde apenas com base no contexto fornecido, sem usar conhecimento externo.",
  });

  if (!respostaIA) {
    return montarRespostaFallback(pergunta);
  }

  if (respostaIndicaIncerteza(respostaIA)) {
    return montarRespostaFallback(pergunta);
  }

  console.log("\n📄 CHUNKS USADOS:");
  chunksRelevantes.forEach((c, i) => {
    console.log(`--- Chunk ${i + 1} (${c.length} chars) ---`);
  });

  const contextoTotal = chunksRelevantes.join("\n\n");

  console.log("📊 Tokens contexto (estimado):", Math.ceil(contextoTotal.length / 4));

  return respostaIA;
}

async function obterRespostaHibrida(pergunta, sessionId = "default") {
  const respostaLocal = buscarResposta(pergunta);

  if (respostaLocal) {
    return respostaLocal;
  }

  return responderComRAG(pergunta, sessionId);
}

module.exports = {
  carregarTextoRAG,
  dividirEmChunks,
  buscarChunksRelevantes,
  montarPromptRAG,
  responderComRAG,
  obterRespostaHibrida,
  normalizarTextoBusca,
};