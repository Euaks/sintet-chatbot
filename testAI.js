require("dotenv").config();

const readline = require("readline");
const { buscarResposta } = require("./knowledgeBase");
const { gerarRespostaIA } = require("./aiService");

async function gerarResposta(texto) {
  const respostaLocal = buscarResposta(texto);

  if (respostaLocal) {
    return respostaLocal;
  }

  const respostaIA = await gerarRespostaIA(texto);
  return respostaIA || "Não entendi. Deseja falar com um atendente?";
}

const entrada = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Teste da IA do SINTET Tocantins");
console.log('Digite uma pergunta ou escreva "sair" para encerrar.');

function perguntar() {
  entrada.question("\nVocê: ", async (texto) => {
    if (texto.trim().toLowerCase() === "sair") {
      entrada.close();
      return;
    }

    const resposta = await gerarResposta(texto);
    console.log(`Bot: ${resposta}`);
    perguntar();
  });
}

perguntar();