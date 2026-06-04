// =====================================
// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

// =====================================
// VARIÁVEIS DE CONTROLE
// =====================================
const atendimentoHumano = {};
const tickets = {};
let option;
const GRUPO_SUPORTE = "CÓDIGO DO GRUPO DE SUPORTE DE ATENDIMENTO AQUI";

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
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
// BUSCANDO CONTATO 
// =====================================
const getContatoId = (msg) => {
    return msg.fromMe ? msg.to : msg.from;
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

        if (msg.from === GRUPO_SUPORTE) {

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
                ticket.atendente = msg._data.notifyName || msg.author || "Atendente";

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
                    `📌 Demanda: ${ticket.necessidade}\n\n` +

                    `👉 Conversar:\n` +
                    `https://wa.me/${ticket.telefone}`,
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
                        `👤 Contato: ${ticket.telefone}\n` +
                        `📅 Abertura: ${ticket.inicio.toLocaleString("pt-BR")}\n` +
                        `📌 Demanda: ${ticket.necessidade}\n\n`;
                    }
                } 

                if (ticketsEmProcesso.length > 0) {
                    mensagem += "📋 *TICKETS EM ANDAMENTO*\n\n";

                    for (const [contatoId, ticket] of ticketsEmProcesso) {

                        mensagem +=
                            `🎫 Protocolo: #\`${ticket.protocolo}\`\n` +
                            `👤 Contato: ${ticket.telefone}\n` +
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
                    `👤 Contato: ${ticket.telefone}\n` +
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

        // IGNORA MSG DO BOT   
        if (msg.fromMe) {
            return;
        };

        // VERIFICA A VARIÁVEL DE CONTROLE 
        if (atendimentoHumano[contatoId]) {
            return;
        }
        
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
        `6️ - AGENDAR HOSPEDAGEM\n` +
        `7️ - FALAR COM ATENDENTE\n\n` +
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

        // =====================================
        // OPÇÃO 7 - FALAR COM ATENDENTE
        // =====================================
        else if (texto === "7") {

            atendimentoHumano[contatoId] = true;

            const protocolo = Date.now().toString().slice(-6);

            const contato = await msg.getContact();

            const telefone = msg.from.replace("@c.us", "");

            tickets[contatoId] = {
                protocolo,
                inicio: new Date(),
                status: "aberto",
                telefone: telefone || contato.number || contato.id.user,
                cliente: contato.pushname || "Não informado",
                necessidade: "Atendimento humano"
            };

            await typing();

            await client.sendMessage(
                msg.from,
                `👨‍💼 *ATENDIMENTO HUMANO*\n\n` +
                `Seu atendimento foi encaminhado para nossa equipe.\n\n` +
                `Aguarde um atendente responder.`
            );

            await client.sendMessage(
                GRUPO_SUPORTE,
                `📩 *NOVO TICKET*\n\n` +
                `🎫 Protocolo: #\`${protocolo}\`\n` +
                `👤 Nome: ${tickets[contatoId].cliente}\n` +
                `💬 Demanda: Atendimento humano\n\n` +
                `Para assumir:\n` +
                `Digite /assumir -número de protocolo-.\n\n` +
                `Para encerrar:\n` +
                `Digite /encerrar -número de protocolo-`
            );

            console.log(`📞 Atendimento humano iniciado: ${msg.from}`);
        }

    } catch (error) {
        console.error("❌ Erro no processamento da mensagem:", error);
    }
});
