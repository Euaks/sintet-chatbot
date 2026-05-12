require("dotenv").config();

const OpenAI = require("openai");

const apiKey = process.env.OPENAI_API_KEY;
const modelName = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const openai = apiKey
  ? new OpenAI({ apiKey })
  : null;

function limitarTexto(texto, limite) {
  const valor = String(texto || "").trim();

  if (valor.length <= limite) {
    return valor;
  }

  return `${valor.slice(0, limite).trim()}...`;
}

async function gerarRespostaIA(texto) {
  if (!openai) {
    console.warn("⚠️ OPENAI_API_KEY não configurada. IA desativada.");
    return null;
  }

  const pergunta = limitarTexto(texto, 500);

  if (!pergunta) {
    return null;
  }

  try {
    const resposta = await openai.chat.completions.create({
      model: modelName,
      temperature: 0.3,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: [
            "Você é um atendente virtual do SINTET Tocantins.",
            "Responda em português do Brasil, com frases curtas e objetivas.",
            "Se não tiver segurança sobre a resposta, oriente o usuário a falar com um atendente humano.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Pergunta do usuário: ${pergunta}`,
        },
      ],
    });

    const conteudo = resposta?.choices?.[0]?.message?.content?.trim();

    if (!conteudo) {
      return null;
    }

    return limitarTexto(conteudo, 600);
  } catch (error) {
    return null;
  }
}

module.exports = {
  gerarRespostaIA,
};