// =====================================
// IMPORTAÇÕES
// =====================================
require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { buscarResposta, normalizeText } = require("./knowledgeBase");
const { gerarRespostaIA } = require("./aiService");

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  },
});

// =====================================
// QR CODE
// =====================================
client.on("qr", (qr) => {
  console.log("📲 Escaneie o QR Code abaixo:");
  qrcode.generate(qr, { small: true });
});

// =====================================
// WHATSAPP CONECTADO
// =====================================
client.on("ready", () => {
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

// =====================================
// DESCONEXÃO
// =====================================
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
});

// =====================================
// INICIALIZA
// =====================================
client.initialize();

// =====================================
// FUNÇÃO DE DELAY
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const mensagensEmProcessamento = new Set();

async function gerarResposta(texto) {
  const respostaLocal = buscarResposta(texto);

  if (respostaLocal) {
    return respostaLocal;
  }

  const respostaIA = await gerarRespostaIA(texto);
  return respostaIA || "Não entendi. Deseja falar com um atendente?";
}

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;

    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.from.endsWith("@g.us")) return;

    const chat = await msg.getChat();
    if (chat.isGroup) return; // blindagem extra

    const textoOriginal = msg.body ? msg.body.trim() : "";
    const texto = normalizeText(textoOriginal);

    if (!texto) return;

    const mensagemId = msg.id?._serialized || `${msg.from}-${msg.timestamp}-${texto}`;

    if (mensagensEmProcessamento.has(mensagemId)) {
      return;
    }

    mensagensEmProcessamento.add(mensagemId);

    try {
      // Função de digitação
      const typing = async () => {
        await delay(2000);
        await chat.sendStateTyping();
        await delay(2000);
      };

      // =====================================
      // MENU FIXO
      // =====================================
      if (texto === "menu") {
        await typing();

        await client.sendMessage(
          msg.from,
          "Olá! 👋\n\n" +
            "Sou o assistente do SINTET Tocantins.\n\n" +
            "Você pode perguntar sobre filiação, direitos, atendimento, telefone, localização e horários.\n" +
            "Se precisar, também posso encaminhar para um atendimento humano."
        );

        return;
      }

      await typing();

      const resposta = await gerarResposta(textoOriginal);

      await client.sendMessage(msg.from, resposta);
    } finally {
      mensagensEmProcessamento.delete(mensagemId);
    }

  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});
