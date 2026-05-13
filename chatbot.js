// =====================================
// IMPORTAÇÕES
// =====================================
require("dotenv").config();

const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

const { buscarResposta, normalizeText, isForaDoEscopo, fallbackMessage } = require("./knowledgeBase");
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
  // tenta resposta local primeiro
  const respostaLocal = buscarResposta(texto);
  if (respostaLocal) return respostaLocal;

  // se não houver, tenta IA
  try {
    const respostaIA = await gerarRespostaIA(texto);
    return respostaIA || "Não entendi. Deseja falar com um atendente?";
  } catch (err) {
    return "Não entendi. Deseja falar com um atendente?";
  }
}

// Controle de estado por usuário
const estadoUsuarios = new Map();

function setEstado(user, estado) {
  estadoUsuarios.set(user, estado);
}

function getEstado(user) {
  return estadoUsuarios.get(user) || "menu";
}

// Mensagens reutilizáveis
function mensagemMenu() {
  return `Olá! 👋\n\n*Atendimento SINTET*\n\n1 - Serviços Básicos\n2 - Atendimento com I.A.\n3 - Falar com atendente humano\n\nDigite o número da opção desejada.`;
}

function mensagemIA() {
  return `🤖 Você está falando com o assistente inteligente do SINTET.\nPode perguntar normalmente ou digite 'menu' para voltar.`;
}

function mensagemServicos() {
  return `*Serviços disponíveis:*\n\n1 - FILIE-SE\n2 - ATUALIZAR DADOS\n3 - CARTEIRINHA\n4 - CONVITE PARA CLUBE\n5 - RESERVAR CLUBE\n6 - AGENDAR HOSPEDAGEM\n\nDigite o número da opção desejada.`;
}

function mensagemHumano() {
  return `👨‍💼 Um atendente humano irá entrar em contato com você em breve.`;
}

function deveIrParaMenu(texto, estadoAtual) {
  const palavrasInicio = ["oi", "ola", "olá", "menu", "inicio", "início", "start", "ajuda", "atendimento", "suporte"];
  return texto === "menu" || (estadoAtual === "servicos" && palavrasInicio.some((p) => texto.includes(p)));
}

function podeResponderIA(textoOriginal) {
  const texto = normalizeText(textoOriginal).toLowerCase();
  if (!texto) return false;

  if (isForaDoEscopo(textoOriginal)) return false;

  const termosLocais = ["sintet", "atendimento", "filiacao", "telefone", "horario", "horarios", "endereco", "localizacao", "clube", "hospedagem", "carteirinha"];
  if (termosLocais.some((termo) => texto.includes(termo))) return true;

  const palavras = texto.split(" ");
  if (palavras.length < 3) return false;

  const perguntasGenéricas = ["como funciona", "me ajuda", "informacao", "informacoes", "sobre isso", "o que e", "o que é", "qual e", "qual é"];
  if (perguntasGenéricas.some((frase) => texto.includes(frase))) return false;

  return true;
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
    const texto = normalizeText(textoOriginal).toLowerCase();

    if (!texto) return;

    const mensagemId = msg.id?._serialized || `${msg.from}-${msg.timestamp}-${texto}`;

    if (mensagensEmProcessamento.has(mensagemId)) return;
    mensagensEmProcessamento.add(mensagemId);
    // limpeza automática caso algo falhe (evita crescimento de memória)
    setTimeout(() => mensagensEmProcessamento.delete(mensagemId), 10000);

    try {
      // typing helper
      const typing = async () => {
        await delay(1200);
        await chat.sendStateTyping();
        await delay(800);
      };

      const estadoAtual = getEstado(msg.from);

      // comando universal para voltar ao menu
      if (deveIrParaMenu(texto, estadoAtual)) {
        await typing();
        await client.sendMessage(msg.from, mensagemMenu());
        setEstado(msg.from, "aguardando_opcao");
        return;
      }

      // Se estivermos aguardando escolha no menu principal
      if (estadoAtual === "aguardando_opcao") {
        if (texto === "1") {
          // entrar em serviços
          await typing();
          await client.sendMessage(msg.from, mensagemServicos());
          setEstado(msg.from, "servicos");
          return;
        }

        if (texto === "2") {
          await typing();
          await client.sendMessage(msg.from, mensagemIA());
          setEstado(msg.from, "ia");
          return;
        }

        if (texto === "3") {
          await typing();
          await client.sendMessage(msg.from, mensagemHumano());
          setEstado(msg.from, "aguardando_opcao");
          return;
        }

        // inválido na escolha principal
        await typing();
        await client.sendMessage(msg.from, `Opção inválida. Digite 1, 2 ou 3, ou 'menu' para ver as opções.`);
        return;
      }

      // MODO SERVIÇOS: apenas funciona se estado === 'servicos'
      if (estadoAtual === "servicos") {
        // aceitar apenas 1..6 dentro desse modo
        if (["1", "2", "3", "4", "5", "6"].includes(texto)) {
          await typing();
          switch (texto) {
            case "1":
              await client.sendMessage(msg.from, `*FILIE-SE*\n\nPara realizar sua filiação ao SINTET, envie:\n\n• Nome completo\n• CPF\n• Telefone\n• Cidade\n\nNossa equipe irá continuar seu atendimento.`);
              break;
            case "2":
              await client.sendMessage(msg.from, `*ATUALIZAÇÃO DE DADOS*\n\nEnvie os dados que deseja atualizar.\n\nExemplo:\n• Telefone\n• Endereço\n• E-mail`);
              break;
            case "3":
              await client.sendMessage(msg.from, `*CARTEIRINHA*\n\nPara solicitar sua carteirinha, envie:\n\n• Nome completo\n• CPF\n• Foto`);
              break;
            case "4":
              await client.sendMessage(msg.from, `🎫 *CONVITE PARA CLUBE*\n\nInforme:\n\n• Nome completo\n• Quantidade de convidados\n• Data desejada`);
              break;
            case "5":
              await client.sendMessage(msg.from, `🏖️ *RESERVAR CLUBE*\n\nPara realizar uma reserva, envie:\n\n• Nome completo\n• Data desejada\n• Quantidade de pessoas`);
              break;
            case "6":
              await client.sendMessage(msg.from, `🏨 *AGENDAR HOSPEDAGEM*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• Data de entrada\n• Data de saída\n• Quantidade de hóspedes`);
              break;
          }
          return;
        }

        // permitir voltar ao menu
        if (texto === "menu" || texto === "ajuda" || texto === "oi" || texto === "ola" || texto === "olá") {
          await typing();
          await client.sendMessage(msg.from, mensagemMenu());
          setEstado(msg.from, "aguardando_opcao");
          return;
        }

        // qualquer outra coisa não é válida aqui
        await typing();
        await client.sendMessage(msg.from, `Digite uma opção de 1 a 6 (ou 'menu' para voltar).`);
        return;
      }

      // MODO IA: apenas quando estado === 'ia'
      if (estadoAtual === "ia") {
        // permitir sair para menu
        if (texto === "menu") {
          await typing();
          await client.sendMessage(msg.from, mensagemMenu());
          setEstado(msg.from, "aguardando_opcao");
          return;
        }

        // processar pergunta na IA
        await typing();
        if (!podeResponderIA(textoOriginal)) {
          await client.sendMessage(msg.from, fallbackMessage);
          return;
        }
        const resp = await gerarResposta(textoOriginal);
        await client.sendMessage(msg.from, resp || "Não entendi. Deseja falar com um atendente? Digite 'menu' para ver opções.");
        return;
      }

      // Estado default: mostrar menu
      await typing();
      await client.sendMessage(msg.from, mensagemMenu());
      setEstado(msg.from, "aguardando_opcao");
    } finally {
      mensagensEmProcessamento.delete(mensagemId);
    }

  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});
