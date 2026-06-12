// =====================================
// IMPORTAÇÕES
// =====================================
require("dotenv").config();

const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

const { normalizeText } = require("./knowledgeBase");
const { obterRespostaHibrida } = require("./ragService");

// =====================================
// VARIÁVEIS DE CONTROLE
// =====================================
const atendimentoHumano = {};
const tickets = {};
const option = {};;
const GRUPO_SUPORTE = "120363408468897027@g.us";

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

const enderecosSintet = {
    palmas: "Quadra ARNE 14 (110 Norte), Alameda 25, Lote 31, Centro, CEP 77006-148.",
    "porto nacional": "Rua Vasco da Gama, Nº 1113, Centro, CEP 77500-000.",
    guarai: "Avenida JK, Nº 2710, Centro, CEP 77700-000.",
    "paraiso do tocantins": "Rua 7 de Setembro, Nº 1601, Setor Oeste, CEP 77600-000.",
    tocantinopolis: "Rua do Ouro, Nº 427, Centro, CEP 77900-000.",
    araguaina: "Rua Neief Murad, Quadra 26, Lote 02, Jardim Santa Helena, CEP 77818-110.",
    gurupi: "Rua Coronel Rodrigues, Nº 256, Centro, CEP 77402-090.",
    "colinas do tocantins": "Rua Tocantins, Quadra 05, Lote 20, Setor Sul, CEP 77760-000.",
    augustinopolis: "Rua Santos Dumont, Nº 125, Centro, CEP 77960-000.",
    "miracema do tocantins": "Rua Tocantins, Nº 618, Centro, CEP 77650-000.",
    dianopolis: "Avenida Sete de Setembro, Nº 512, Centro, CEP 77300-000.",
    arraias: "Praça Dr. Juvêncio, Nº 40, Centro, CEP 77330-000.",
};

function formatarMunicipio(nomeMunicipio) {
    return String(nomeMunicipio || "")
    .split(" ")
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

function ehConsultaLocalizacao(textoOriginal) {
    const texto = normalizeText(textoOriginal).toLowerCase();
    if (!texto) return false;

    const termosLocalizacao = [
        "localizacao",
        "endereco",
        "onde fica",
        "onde e",
        "onde eh",
        "qual endereco",
        "qual e o endereco",
        "qual é o endereço",
    ];

    return termosLocalizacao.some((termo) => texto.includes(normalizeText(termo)));
}

function buscarEnderecoMunicipio(textoOriginal) {
    const municipio = normalizeText(textoOriginal).toLowerCase();
    return enderecosSintet[municipio] || null;
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
// BUSCANDO CONTATO 
// =====================================
const getContatoId = (msg) => {
    return msg.fromMe ? msg.to : msg.from;
};

// =====================================
// CRIANDO TICKET 
// =====================================
const createTicket = async (contatoId, msg) => {
    atendimentoHumano[contatoId] = true;

    const protocolo = Date.now().toString().slice(-6);

    const contato = await msg.getContact();

    tickets[contatoId] = {
        protocolo,
        inicio: new Date(),
        status: "aberto",
        cliente: contato.pushname || "Não informado",
        necessidade: option[contatoId]
    };

    await client.sendMessage(
        GRUPO_SUPORTE,
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

            const partes = textoGrupo.split(" ");
            const protocolo = partes[1];

            if (!protocolo) {
                await client.sendMessage(
                    GRUPO_SUPORTE,
                    "⚠️ Informe o protocolo.\nExemplo:\n/r 48392"
                );
                return;
            }

            const mensagem = partes.slice(2).join(" ");

            const resultado = getTicket(protocolo);

            if (!resultado) {
                await client.sendMessage(
                    GRUPO_SUPORTE,
                    `❌ Ticket #${protocolo} não encontrado.`
                );
                return;
            }

            const [contatoId, ticket] = resultado;

            await client.sendMessage(
                contatoId,
                `*${ticket.atendente}*`,
                mensagem
            );

            await client.sendMessage(
                msg.from,
                "✅ Mensagem enviada."
            );

            return;
        }

        if (msg.from === GRUPO_SUPORTE || msg.to === GRUPO_SUPORTE) {

            const textoGrupo = msg.body.trim();

            // COMANDO INTERNO PARA REATIVAÇÃO DO BOT APÓS ATENDIMENTO 
            if (textoGrupo.startsWith("/encerrar")) {

                const partes = textoGrupo.split(" ");
                const protocolo = partes[1];

                if (!protocolo) {
                    await client.sendMessage(
                        GRUPO_SUPORTE,
                        "⚠️ Informe o protocolo.\nExemplo:\n/encerrar 48392"
                    );
                    return;
                }

                const resultado = getTicket(protocolo);

                if (!resultado) {
                    await client.sendMessage(
                        GRUPO_SUPORTE,
                        `❌ Ticket #${protocolo} não encontrado.`
                    );
                    return;
                }

                const [contatoId, ticket] = resultado;

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
                    GRUPO_SUPORTE,
                    `✅ Ticket #${protocolo} encerrado com sucesso.`
                );

                console.log(`✅ Ticket encerrado: ${protocolo}`);

            // COMANDO INTERNO PARA ASSUMIR UM TICKET ATENDIMENTO 
            } else if (textoGrupo.startsWith("/assumir")) {

                const partes = textoGrupo.split(" ");
                const protocolo = partes[1];

                if (!protocolo) {
                    await client.sendMessage(
                        GRUPO_SUPORTE,
                        "⚠️ Informe o protocolo.\nExemplo:\n/assumir 48392"
                    );
                    return;
                }

                const resultado = getTicket(protocolo);

                if (!resultado) {
                    await client.sendMessage(
                        GRUPO_SUPORTE,
                        `❌ Ticket #${protocolo} não encontrado.`
                    );
                    return;
                }

                const [contatoId, ticket] = resultado;

                if (ticket.status === "em processo") {
                    await client.sendMessage(
                        GRUPO_SUPORTE,
                        `❌ Ticket #${protocolo} já assumido.`
                    );
                    return;
                }

                ticket.status = "em processo";
                ticket.atendente = msg._data.notifyName || "Atendente";
                ticket.atendenteId = msg.author;

                await client.sendMessage(
                    GRUPO_SUPORTE,
                    `✅ Ticket #${protocolo} assumido por ${ticket.atendente}.`
                );

                await client.sendMessage(
                    GRUPO_SUPORTE,

                    `📞 *CLIENTE ATRIBUÍDO*\n\n` +

                    `🙋 Atendente: ${ticket.atendente}\n` +
                    `🎫 Protocolo: #\`${ticket.protocolo}\`\n` +
                    `👤 Cliente: ${ticket.cliente}\n` +
                    `📱 Número: ${ticket.telefone}\n` +
                    `📌 Demanda: ${ticket.necessidade}\n\n` 
                );

            // COMANDO INTERNO PARA LISTAGEM DOS TICKETS NÃO FECHADOS  
            } else if (textoGrupo.startsWith("/tickets")) {

                const ticketsAbertos = Object.entries(tickets)
                    .filter(([_, ticket]) => ticket.status === "aberto");

                const ticketsEmProcesso = Object.entries(tickets)
                    .filter(([_, ticket]) => ticket.status === "em processo");

                if (ticketsAbertos.length === 0 && ticketsEmProcesso.length === 0) {

                    await client.sendMessage(
                        GRUPO_SUPORTE,
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
                    GRUPO_SUPORTE,
                    mensagem
                );

                return;
            } else if (textoGrupo.startsWith("/meustickets")) {

                const seusTickets = Object.entries(tickets)
                    .filter(([_, ticket]) => ticket.atendente === (msg._data.notifyName || msg.author));

                if (seusTickets.length === 0) {

                    await client.sendMessage(
                        GRUPO_SUPORTE,
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
                    GRUPO_SUPORTE,
                    mensagem
                );

                return;
            } else if (textoGrupo.startsWith("/")) {

                await client.sendMessage(
                GRUPO_SUPORTE,
                `❌*COMANDO INVÁLIDO*\n\n`+
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

            if (estadoAtual === "aguardando_municipio") {
                const endereco = buscarEnderecoMunicipio(textoOriginal);
                
                await typing();
                
                if (endereco) {
                    await client.sendMessage(
                    msg.from,
                    `📍 Endereço do SINTET em ${formatarMunicipio(texto)}: ${endereco}`
                );
                setEstado(msg.from, "aguardando_opcao");
                } else {
                    await client.sendMessage(msg.from, "Não encontrei esse município. Tente novamente ou digite 'menu'.");
                }
            return;
            }

            if (ehConsultaLocalizacao(textoOriginal)) {
                await typing();
                setEstado(msg.from, "aguardando_municipio");
                await client.sendMessage(msg.from, "📍 De qual município você deseja o endereço do SINTET?");
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
                    await createTicket(contatoId, msg);
                    option[contatoId] = "Atendimento geral";
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
                if (["1", "2", "3", "4", "5", "6", "7", "8", "9","10"].includes(texto)) {
                    await typing();
                    switch (texto) {
                    case "1":
                        await client.sendMessage(msg.from, `*FILIE-SE*\n\nPara realizar sua filiação ao SINTET, envie:\n\n• Nome completo\n• CPF\n• Telefone\n• Cidade\n\nNossa equipe irá continuar seu atendimento.`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Filiação";
                        break;
                    case "2":
                        await client.sendMessage(msg.from, `*ATUALIZAÇÃO DE DADOS*\n\nEnvie os dados que deseja atualizar.\n\nExemplo:\n• Telefone\n• Endereço\n• E-mail`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Atualizar dados";
                        break;
                    case "3":
                        await client.sendMessage(msg.from, `*CARTEIRINHA*\n\nPara solicitar sua carteirinha, envie:\n\n• Nome completo\n• CPF\n• Foto`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Carteirinha";
                        break;
                    case "4":
                        await client.sendMessage(msg.from, `🎫 *CONVITE PARA CLUBE*\n\nInforme:\n\n• Nome completo\n• Quantidade de convidados\n• Data desejada`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Convite para clube";
                        break;
                    case "5":
                        await client.sendMessage(msg.from, `🏖️ *RESERVAR CLUBE*\n\nPara realizar uma reserva, envie:\n\n• Nome completo\n• Data desejada\n• Quantidade de pessoas`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Reservar clube";
                        break;
                    case "6":
                        await client.sendMessage(msg.from, `🏨 *AGENDAR HOSPEDAGEM*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• Data de entrada\n• Data de saída\n• Quantidade de hóspedes`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Agendar hospedagem";
                        break;
                    case "7":
                        await client.sendMessage(msg.from, `📚 *ATENDIMENTO JURÍDICO*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Cidade\n• Assunto do atendimento`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Atendimento jurídico";
                        break;
                    case "8":
                        await client.sendMessage(msg.from, `🏨 *SINTET PALMAS*\n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Atendimento geral";
                        break;
                    case "9":
                        await client.sendMessage(msg.from, `💰 *FINANCEIRO*\  n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Atendimento financeiro";
                        break;
                    case "10":
                        await client.sendMessage(msg.from, `📢 *COMUNICAÇÃO*\  n\nEnvie as seguintes informações:\n\n• Nome completo\n• CPF\n• Telefone\n• Assunto do atendimento`);
                        await createTicket(contatoId, msg);
                        option[contatoId] = "Atendimento geral";
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

            // MODO IA: apenas quando estado === 'ia'
            if (estadoAtual === "ia") {
                // permitir sair para menu
                if (texto === "menu") {
                    await typing();
                    await client.sendMessage(msg.from, mensagemMenu());
                    setEstado(msg.from, "aguardando_opcao");
                    return;
                }

                await typing();
                const resp = await obterRespostaHibrida(textoOriginal, msg.from);

                if (resp) {
                    await client.sendMessage(msg.from, resp);
                    return;
                }

                await client.sendMessage(msg.from, "Não encontrei essa informação com segurança. Se quiser, posso encaminhar para um atendente humano.");
                setEstado(msg.from, "atendimento");
                option[contatoId] = "Atendimento geral";
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




