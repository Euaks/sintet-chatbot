# sintet-chatbot
Chatbot de atendimento automatizado para o SINTET Tocantins, integrado ao WhatsApp, desenvolvido para informar e auxiliar processos

## Configuração

1. Copie o arquivo `.env.example` para `.env`.
2. Preencha `GEMINI_API_KEY` com sua chave do Google AI Studio.
3. Ajuste `GEMINI_MODEL` se quiser usar outro modelo.

O projeto já carrega variáveis de ambiente com `dotenv` e ignora arquivos sensíveis via `.gitignore`.

## IA

O chatbot usa o SDK oficial `@google/genai` com o modelo `gemini-2.5-flash` para a camada de resposta generativa.

## RAG

Quando a base local não responde, o sistema lê `teste_sintet.txt`, quebra o conteúdo em chunks em memória, busca os trechos mais relevantes e envia apenas esse contexto para o Gemini.

Fluxo usado no código:

```js
const { obterRespostaHibrida } = require("./ragService");

const resposta = await obterRespostaHibrida("qual é a filiação?", "usuario-123");
```

Se o contexto não trouxer segurança suficiente, o fluxo cai para o atendimento humano sem tentar enviar o documento inteiro para a IA.
