// =====================================
// IMPORTAÇÕES
// =====================================
require("dotenv").config();

const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

// =====================================
// VARIÁVEIS DE CONTROLE
// =====================================
const atendimentoHumano = {};
const tickets = {};
const option = {};;
const GRUPOS_ATENDIMENTO = {
  filiacao: process.env.GRUPO_FILIACAO,
  cadastro: process.env.GRUPO_CADASTRO,
  carteirinha: process.env.GRUPO_CARTEIRINHA,
  clube: process.env.GRUPO_CLUBE,
  hospedagem: process.env.GRUPO_HOSPEDAGEM,
  juridico: process.env.GRUPO_JURIDICO,
  palmas: process.env.GRUPO_PALMAS,
  financeiro: process.env.GRUPO_FINANCEIRO,
  comunicacao: process.env.GRUPO_COMUNICACAO,
  geral: process.env.GRUPO_GERAL,
};

function formatarDataMensagem(data) {
  return new Date(data || Date.now()).toLocaleString("pt-BR");
}

function adicionarMensagemAoTicket(contatoId, texto, origem = "cliente") {
  const ticket = tickets[contatoId];

  if (!ticket) return;

  if (!Array.isArray(ticket.mensagensCliente)) {
    ticket.mensagensCliente = [];
  }

  ticket.mensagensCliente.push({
    origem,
    texto: String(texto || "").trim(),
    data: new Date(),
  });
}

function montarResumoCliente(ticket) {
  const mensagens = Array.isArray(ticket?.mensagensCliente) ? ticket.mensagensCliente : [];

  if (mensagens.length === 0) {
    return "Nenhuma informação adicional foi registrada até o momento.";
  }

  return mensagens
    .map((item, indice) => `${indice + 1}.  ${item.texto}`)
    .join("\n");
}

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


function normalizeText(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// =====================================
// FUNÇÃO DE DELAY
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const mensagensEmProcessamento = new Set();

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
  return `*Atendimento*\n\n1 - Serviços\n2 - Perguntas Frequentes\n3 - Falar com atendente\n\nDigite o número da opção desejada.`;
}

function mensagemServicos() {
  return `*Serviços disponíveis:*\n\n1 - Filia-se\n2 - Atualizar Dados\n3 - Carteirinha\n4 - Convite para Clube\n5 - Reservar Clube\n6 - Agendar Hospedagem\n7 - Atendimento Jurídico\n8 - Sintet Palmas\n9 - Financeiro\n10 - Comunicação\n\nDigite o número da opção desejada.`;
}

function mensagemPerguntas() {
  return `*Perguntas frequentes:*\n\n1 - 📍 Localização\n2 - 🕒 Horário de atendimento\n3 - 📄 Serviços oferecidos\n4 - 📢 Notícias e eventos\n\nDigite o número da opção desejada.`;
}

function mensagemHumano() {
  return `👨‍💼 Um atendente irá entrar em contato com você em breve.`;
}

function deveIrParaMenu(texto, estadoAtual) {
  const palavrasInicio = ["oi", "ola", "olá", "menu", "inicio", "início", "start", "ajuda", "atendimento", "suporte"];
  return texto === "menu" || (estadoAtual === "servicos" && palavrasInicio.some((p) => texto.includes(p)));
}

// =====================================
// BUSCANDO CONTATO 
// =====================================
const getContatoId = (msg) => {
  return msg.fromMe ? msg.to : msg.from;
};

// =====================================
// CRIANDO TICKET 
// =====================================
const createTicket = async (contatoId, msg, departamento) => {
  atendimentoHumano[contatoId] = true;

  const protocolo = Date.now().toString().slice(-6);

  const contato = await msg.getContact();

  tickets[contatoId] = {
    protocolo,
    inicio: new Date(),
    status: "aberto",
    cliente: contato.pushname || "Não informado",
    necessidade: option[contatoId],
    departamento: GRUPOS_ATENDIMENTO[departamento] || GRUPOS_ATENDIMENTO.geral,
    contatoId: contatoId,
    mensagensCliente: [],
  };

  adicionarMensagemAoTicket(contatoId, `Solicitação aberta para: ${option[contatoId] || "Atendimento geral"}`, "sistema");

  await client.sendMessage(
    tickets[contatoId].departamento,
    `📩 *NOVO TICKET*\n\n` +
    `🎫 Protocolo: #\`${protocolo}\`\n` +
    `👤 Nome: ${tickets[contatoId].cliente}\n` +
    `💬 Demanda: ${option[contatoId]}\n\n` +
    `Para assumir:\n` +
    `Digite /assumir -número de protocolo-.\n\n` +
    `Para encerrar:\n` +
    `Digite /encerrar -número de protocolo-`
  );

  console.log(`📞 Atendimento humano iniciado: ${msg.from}`);
};


// =====================================
// BUSCANDO TICKET 
// =====================================
const getTicket = (protocolo) => {
  return Object.entries(tickets).find(
    ([_, ticket]) => ticket.protocolo == protocolo
  );
};

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {

    const contatoId = getContatoId(msg);

    if (msg.body.startsWith("/r")) {

      const texto = msg.body.trim();
      const partes = texto.split(" ");
      const protocolo = partes[1];

      if (!protocolo) {
        await client.sendMessage(
          msg.from,
          "⚠️ Informe o protocolo.\nExemplo:\n/r 48392"
        );
        return;
      }

      const mensagem = partes.slice(2).join(" ");

      const resultado = getTicket(protocolo);

      if (!resultado) {
        await client.sendMessage(
          msg.from,
          `❌ Ticket #${protocolo} não encontrado.`
        );
        return;
      }

      const [contatoId, ticket] = resultado;

      if (!mensagem || mensagem.trim() === "") {
        await client.sendMessage(
          msg.from,
          "⚠️ Digite a mensagem.\nExemplo:\n/r 48392 Olá!"
        );
        return;
      }

      await client.sendMessage(
        ticket.contatoId,
        `*${ticket.atendente}*\n\n${mensagem}`
      );

      return;
    }

    const gruposSuporte = Object.values(
      GRUPOS_ATENDIMENTO
    );



    if (gruposSuporte.includes(msg.from)) {

      const grupoAtual = msg.from;
      console.log(grupoAtual);
      const textoGrupo = msg.body.trim();

      // COMANDO INTERNO PARA REATIVAÇÃO DO BOT APÓS ATENDIMENTO 
      if (textoGrupo.startsWith("/encerrar")) {

        const partes = textoGrupo.split(" ");
        const protocolo = partes[1];

        if (!protocolo) {
          await client.sendMessage(
            grupoAtual,
            "⚠️ Informe o protocolo.\nExemplo:\n/encerrar 48392"
          );
          return;
        }

        const resultado = getTicket(protocolo);

        if (!resultado) {
          await client.sendMessage(
            grupoAtual,
            `❌ Ticket #${protocolo} não encontrado.`
          );
          return;
        }

        const [contatoId, ticket] = resultado;

        if (ticket.departamento != grupoAtual) {
          await client.sendMessage(
            grupoAtual,
            `❌ Este ticket pertence a outro setor.`);
          return;
        }

        delete atendimentoHumano[contatoId];

        ticket.status = "fechado";
        ticket.fechadoEm = new Date();
        ticket.atendente = undefined;

        await client.sendMessage(
          contatoId,
          `✅ Seu atendimento foi encerrado.\n\n` +
          `🤖 O atendimento automático foi reativado.`
        );

        await client.sendMessage(
          grupoAtual,
          `✅ Ticket #${protocolo} encerrado com sucesso.`
        );

        console.log(`✅ Ticket encerrado: ${protocolo}`);

        // COMANDO INTERNO PARA ASSUMIR UM TICKET ATENDIMENTO 
      } else if (textoGrupo.startsWith("/assumir")) {

        const partes = textoGrupo.split(" ");
        const protocolo = partes[1];

        if (!protocolo) {
          await client.sendMessage(
            grupoAtual,
            "⚠️ Informe o protocolo.\nExemplo:\n/assumir 48392"
          );
          return;
        }

        const resultado = getTicket(protocolo);

        if (!resultado) {
          await client.sendMessage(
            grupoAtual,
            `❌ Ticket #${protocolo} não encontrado.`
          );
          return;
        }

        const [contatoId, ticket] = resultado;

        if (ticket.departamento != grupoAtual) {
          await client.sendMessage(
            grupoAtual,
            `❌ Este ticket pertence a outro setor.`);
          return;
        }

        if (ticket.status === "em processo") {
          await client.sendMessage(
            grupoAtual,
            `❌ Ticket #${protocolo} já assumido.`
          );
          return;
        }

        ticket.status = "em processo";
        ticket.atendente = msg._data.notifyName || "Atendente";
        ticket.atendenteId = msg.author;

        await client.sendMessage(
          grupoAtual,
          `✅ Ticket #${protocolo} assumido por ${ticket.atendente}.`
        );

        await client.sendMessage(
          ticket.atendenteId,
          `📄 *RESUMO DO CLIENTE*\n\n` +
          `🎫 Protocolo: #${ticket.protocolo}\n` +
          `👤 Cliente: ${ticket.cliente}\n` +
          `📌 Demanda: ${ticket.necessidade}\n\n` +
          `📝 *Mensagens registradas antes da assunção:*\n${montarResumoCliente(ticket)}`
        );

        // COMANDO INTERNO PARA LISTAGEM DOS TICKETS NÃO FECHADOS  
      } else if (textoGrupo.startsWith("/tickets")) {

        const ticketsAbertos = Object.entries(tickets)
          .filter(([_, ticket]) => ticket.departamento == grupoAtual && ticket.status === "aberto");

        const ticketsEmProcesso = Object.entries(tickets)
          .filter(([_, ticket]) => ticket.departamento == grupoAtual && ticket.status === "em processo");

        if (ticketsAbertos.length === 0 && ticketsEmProcesso.length === 0) {

          await client.sendMessage(
            grupoAtual,
            "☑️ Nenhum ticket disponível."
          );

          return;
        }

        let mensagem = "";

        if (ticketsAbertos.length > 0) {
          mensagem += "📋 *TICKETS EM ABERTO*\n\n";

          for (const [contatoId, ticket] of ticketsAbertos) {

            mensagem +=
              `🎫 Protocolo: #\`${ticket.protocolo}\`\n` +
              `👤 Cliente: ${ticket.cliente}\n` +
              `📅 Abertura: ${ticket.inicio.toLocaleString("pt-BR")}\n` +
              `📌 Demanda: ${ticket.necessidade}\n\n`;
          }
        }

        if (ticketsEmProcesso.length > 0) {
          mensagem += "📋 *TICKETS EM ANDAMENTO*\n\n";

          for (const [contatoId, ticket] of ticketsEmProcesso) {

            mensagem +=
              `🎫 Protocolo: #\`${ticket.protocolo}\`\n` +
              `👤 Cliente: ${ticket.cliente}\n` +
              `🙋 Atendente: ${ticket.atendente}\n` +
              `📅 Abertura: ${ticket.inicio.toLocaleString("pt-BR")}\n` +
              `📌 Demanda: ${ticket.necessidade}\n\n`;
          }
        }

        await client.sendMessage(
          grupoAtual,
          mensagem
        );

        return;
      } else if (textoGrupo.startsWith("/meustickets")) {

        const seusTickets = Object.entries(tickets)
          .filter(([_, ticket]) => ticket.departamento == grupoAtual && ticket.atendente === (msg._data.notifyName || msg.author));

        if (seusTickets.length === 0) {

          await client.sendMessage(
            grupoAtual,
            "☑️ Você não possui tickets pendentes."
          );

          return;
        }

        let mensagem = "📋 *SEUS TICKETS*\n\n";

        for (const [contatoId, ticket] of seusTickets) {

          mensagem +=
            `🎫 Protocolo: #\`${ticket.protocolo}\`\n` +
            `👤 Cliente: ${ticket.cliente}\n` +
            `🙋 Atendente: ${ticket.atendente}\n` +
            `📅 Abertura: ${ticket.inicio.toLocaleString("pt-BR")}\n` +
            `📌 Demanda: ${ticket.necessidade}\n\n`;
        }

        await client.sendMessage(
          grupoAtual,
          mensagem
        );

        return;
      } else if (textoGrupo.startsWith("/")) {

        await client.sendMessage(
          grupoAtual,
          `❌*COMANDO INVÁLIDO*\n\n` +
          `📋 *LISTAS DE COMANDOS*\n` +
          `/tickets: usado para listar todos os tickets não finalizados\n` +
          `/meustickets: usado para listar seus tickets em andamento\n` +
          `/assumir: usado para assumir um ticket\n` +
          `/encerrar: usado para encerrar o atendimento de um ticket`
        );
      }

      return;
    }

    // VERIFICA A VARIÁVEL DE CONTROLE
    if (atendimentoHumano[contatoId]) {

      const ticket = tickets[contatoId];

      if (ticket) {
        adicionarMensagemAoTicket(contatoId, msg.body, ticket.atendenteId ? "cliente" : "cliente_aguardando_assuncao");
      }

      if (ticket?.atendenteId) {
        await client.sendMessage(
          ticket.atendenteId,

          `📩 NOVA MENSAGEM\n\n` +
          `🎫 Ticket: ${ticket.protocolo}\n` +
          `👤 Cliente: ${ticket.cliente}\n\n` +
          `${msg.body}`
        );
      }
      return;
    }

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
          await client.sendMessage(msg.from, mensagemPerguntas());
          setEstado(msg.from, "perguntas");
          return;
        }

        if (texto === "3") {
          await typing();
          await client.sendMessage(msg.from, mensagemHumano());
          option[contatoId] = "Atendimento geral";
          await createTicket(contatoId, msg, "geral");
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
        if (["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(texto)) {
          await typing();
          switch (texto) {
            case "1":
              await client.sendMessage(msg.from, `*FILIE-SE*\n\nPara realizar sua filiação ao SINTET, envie:\n\n• Nome completo\n• CPF\n• Telefone\n• Cidade\n\nNossa equipe irá continuar seu atendimento.`);
              option[contatoId] = "Filiação";
              await createTicket(contatoId, msg, "filiacao");
              break;
            case "2":
              await client.sendMessage(msg.from, `*ATUALIZAÇÃO DE DADOS*\n\nEnvie os dados que deseja atualizar.\n\nExemplo:\n• Telefone\n• Endereço\n• E-mail`);
              option[contatoId] = "Atualizar dados";
              await createTicket(contatoId, msg, "cadastro");
              break;
            case "3":
              await client.sendMessage(msg.from, `*CARTEIRINHA*\n\nPara solicitar sua carteirinha, envie:\n\n• Nome completo\n• CPF\n• Foto`);
              option[contatoId] = "Carteirinha";
              await createTicket(contatoId, msg, "carteirinha");
              break;
            case "4":
              await client.sendMessage(msg.from, `🎫 *CONVITE PARA CLUBE*\n\nInforme:\n\n• Nome completo\n• Quantidade de convidados\n• Data desejada`);
              option[contatoId] = "Convite para clube";
              await createTicket(contatoId, msg, "clube");
              break;
            case "5":
              await client.sendMessage(msg.from, `🏖️ *RESERVAR CLUBE*\n\nPara realizar uma reserva, envie:\n\n• Nome completo\n• Data desejada\n• Quantidade de pessoas`);
              option[contatoId] = "Reservar clube";
              await createTicket(contatoId, msg, "clube");
              break;
            case "6":
              await client.sendMessage(msg.from, `🏨 *AGENDAR HOSPEDAGEM*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• Data de entrada\n• Data de saída\n• Quantidade de hóspedes`);
              option[contatoId] = "Agendar hospedagem";
              await createTicket(contatoId, msg, "hospedagem");
              break;
            case "7":
              await client.sendMessage(msg.from, `📚 *ATENDIMENTO JURÍDICO*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Cidade\n• Assunto do atendimento`);
              option[contatoId] = "Atendimento jurídico";
              await createTicket(contatoId, msg, "juridico");
              break;
            case "8":
              await client.sendMessage(msg.from, `🏨 *SINTET PALMAS*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
              option[contatoId] = "Atendimento geral";
              await createTicket(contatoId, msg);
              break;
            case "9":
              await client.sendMessage(msg.from, `💰 *FINANCEIRO*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
              option[contatoId] = "Atendimento financeiro";
              await createTicket(contatoId, msg, "palmas");
              break;
            case "10":
              await client.sendMessage(msg.from, `📢 *COMUNICAÇÃO*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
              option[contatoId] = "Atendimento geral";
              await createTicket(contatoId, msg, "financeiro");
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
        await client.sendMessage(msg.from, `Digite uma opção de 1 a 10 (ou 'menu' para voltar).`);
        return;
      }

      // MODO PERGUNTAS: apenas quando estado === 'perguntas'
      if (estadoAtual === "perguntas") {
        // aceitar apenas 1..4 dentro desse modo
        if (["1", "2", "3", "4"].includes(texto)) {
          await typing();
          switch (texto) {
            case "1":
              await client.sendMessage(msg.from, `📍 *Localização - SINTET Palmas*\n\nEndereço:\nQuadra 110 Norte, Alameda 25, Lote 31\nPlano Diretor Norte\nPalmas - TO\nCEP: 77006-148\n\n📞 Telefone: (63) 3213-2161\n\nDigite 'menu' para voltar ao menu.`);
              break;
            case "2":
              await client.sendMessage(msg.from, `🕒 *Horário de atendimento*\n\nSegunda a sexta-feira:\n08:00 às 12:00\n14:00 às 18:00\n\n❌ Sábados, domingos e feriados: fechado\n\nDigite 'menu' para voltar ao menu.`);
              break;
            case "3":
              await client.sendMessage(msg.from, `📄 *Serviços oferecidos*\n\nO SINTET atua na defesa dos trabalhadores da educação, oferecendo:\n\n• Atendimento jurídico (trabalhista e previdenciário)\n• Assessoria sindical\n• Apoio aos profissionais da educação\n• Formação e capacitação\n• Convênios e benefícios para filiados\n\nDigite 'menu' para voltar ao menu.`);
              break;
            case "4":
              await client.sendMessage(msg.from, `📢 *Notícias e eventos*\n\nAcompanhe as últimas notícias, comunicados e eventos do SINTET:\n\n🌐 Site oficial:\nhttps://www.sintet.org.br\n\n📌 Lá você encontra:\n• Notícias atualizadas\n• Informações sobre greves e assembleias\n• Comunicados importantes\n\nDigite 'menu' para voltar ao menu.`);
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
        await client.sendMessage(msg.from, `Digite uma opção de 1 a 4 (ou 'menu' para voltar).`);
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
