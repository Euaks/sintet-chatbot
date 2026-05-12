// =====================================
// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

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

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {
    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.from.endsWith("@g.us")) return;

    const chat = await msg.getChat();
    if (chat.isGroup) return; // blindagem extra

    const texto = msg.body ? msg.body.trim().toLowerCase() : "";

    // Função de digitação
    const typing = async () => {
      await delay(2000);
      await chat.sendStateTyping();
      await delay(2000);
    };
    const palavrasInicio = [
      "oi",
      "ola",
      "olá",
      "opa",
      "iae",
      "eae",
      "eae",
      "hey",
      "hello",
      "hi",
      "menu",
      "inicio",
      "início",
      "start",
      "começar",
      "comecar",
      "ajuda",
      "socorro",
      "atendimento",
      "suporte",
      "informações",
      "informacao",
      "informacaoes",
      "informacoes",
      "quero ajuda",
      "preciso de ajuda",
      "bom dia",
      "boa tarde",
      "boa noite",
      "tudo bem",
      "tem alguém",
      "tem alguem",
      "alguém ai",
      "alguem ai",
      "falar com atendente",
      "falar com suporte",
      "quero atendimento",
      "quero me filiar",
      "sintet",
      "sindicato",
      "clube",
      "hospedagem",
      "carteirinha",
      "."
    ];
    // =====================================
    // MENSAGEM INICIAL
    // =====================================
    if (palavrasInicio.some(p => texto.includes(p))) {

    await typing();

    const hora = new Date().getHours();
    let saudacao = "Olá";

    if (hora >= 5 && hora < 12) saudacao = "Bom dia";
    else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
    else saudacao = "Boa noite";

    await client.sendMessage(
    msg.from,
    `${saudacao}! 👋\n\n` +
    `*Bem-vindo ao atendimento automático do SINTET*\n\n` +
    `*Serviços disponíveis:*\n\n` +

    `1️ - FILIE-SE\n` +
    `2️ - ATUALIZAR DADOS\n` +
    `3️ - CARTEIRINHA\n` +
    `4️ - CONVITE PARA CLUBE\n` +
    `5️ - RESERVAR CLUBE\n` +
    `6️ - AGENDAR HOSPEDAGEM\n\n` +

    `Digite o número da opção desejada.`
    );
    }

    // =====================================
    // OPÇÃO 1 - FILIE-SE
    // =====================================
    else if (texto === "1") {

    await typing();

    await client.sendMessage(
    msg.from,
    ` *FILIE-SE*\n\n` +
    `Para realizar sua filiação ao SINTET, envie:\n\n` +
    `• Nome completo\n` +
    `• CPF\n` +
    `• Telefone\n` +
    `• Cidade\n\n` +
    `Nossa equipe irá continuar seu atendimento.`
    );
    }

    // =====================================
    // OPÇÃO 2 - ATUALIZAR DADOS
    // =====================================
    else if (texto === "2") {

    await typing();

    await client.sendMessage(
    msg.from,
    ` *ATUALIZAÇÃO DE DADOS*\n\n` +
    `Envie os dados que deseja atualizar.\n\n` +
    `Exemplo:\n` +
    `• Telefone\n` +
    `• Endereço\n` +
    `• E-mail`
    );
    }

    // =====================================
    // OPÇÃO 3 - CARTEIRINHA
    // =====================================
    else if (texto === "3") {

    await typing();

    await client.sendMessage(
    msg.from,
    `*CARTEIRINHA*\n\n` +
    `Para solicitar sua carteirinha, envie:\n\n` +
    `• Nome completo\n` +
    `• CPF\n` +
    `• Foto `
    );
    }

    // =====================================
    // OPÇÃO 4 - CONVITE PARA CLUBE
    // =====================================
    else if (texto === "4") {
    await typing();

    await client.sendMessage(
    msg.from,
    `🎫 *CONVITE PARA CLUBE*\n\n` +
    `Informe:\n\n` +
    `• Nome completo\n` +
    `• Quantidade de convidados\n` +
    `• Data desejada`
    );
    }

    // =====================================
    // OPÇÃO 5 - RESERVAR CLUBE
    // =====================================
    else if (texto === "5") {

    await typing();
    await client.sendMessage(
    msg.from,
    `🏖️ *RESERVAR CLUBE*\n\n` +
    `Para realizar uma reserva, envie:\n\n` +
    `• Nome completo\n` +
    `• Data desejada\n` +
    `• Quantidade de pessoas`
    );
    }

    // =====================================
    // OPÇÃO 6 - AGENDAR HOSPEDAGEM
    // =====================================
    else if (texto === "6") {

    await typing();

    await client.sendMessage(
    msg.from,
    `🏨 *AGENDAR HOSPEDAGEM*\n\n` +
    `Envie as seguintes informações:\n\n` +
    `• Nome completo\n` +
    `• Data de entrada\n` +
    `• Data de saída\n` +
    `• Quantidade de hóspedes`
    );
    }

  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});
