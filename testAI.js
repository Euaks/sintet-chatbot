require("dotenv").config();

const readline = require("readline");
const { obterRespostaHibrida } = require("./ragService");

// 🔹 Função simples de estimativa
function estimarTokens(texto) {
  if (!texto) return 0;
  return Math.ceil(texto.length / 4);
}

async function gerarResposta(texto) {
  const resposta = await obterRespostaHibrida(texto, "cli");

  // 🔥 LOG DE TOKENS (entrada + saída)
  const tokensEntrada = estimarTokens(texto);
  const tokensSaida = estimarTokens(resposta);

  console.log("\n[USO DE TOKENS]");
  console.log("Entrada:", tokensEntrada);
  console.log("Saída:", tokensSaida);
  console.log("Total:", tokensEntrada + tokensSaida);

  return (
    resposta ||
    "Não encontrei essa informação com segurança. Se quiser, posso encaminhar para um atendente humano."
  );
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