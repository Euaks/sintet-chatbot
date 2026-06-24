# 🤖 Chatbot SINTET - Atendimento Automatizado no WhatsApp

## 📚 Sobre o projeto

Este projeto foi desenvolvido como parte do **Trabalho de Prática Extensionista II – Realidade**, da **Universidade Federal do Tocantins (UFT)**, em parceria com o **SINTET (Sindicato dos Trabalhadores em Educação do Tocantins)**.

O objetivo principal é automatizar o atendimento via WhatsApp, oferecendo suporte rápido, organizado e escalável para os usuários, além de encaminhar demandas para atendimento humano quando necessário.

---

## 👨‍💻 Equipe de desenvolvimento

* Pedro Henrique
* Pedro Vinícius
* Kauê
* Marcos

---

## 🚀 Tecnologias utilizadas

* Node.js
* WhatsApp Web.js
* Puppeteer
* Dotenv
* qrcode-terminal
* JavaScript (ES6+)

---

## ⚙️ Funcionalidades do sistema

O chatbot possui um sistema completo de atendimento híbrido (automático + humano), com os seguintes módulos:

### 📌 Menu principal

* Serviços
* Perguntas frequentes
* Atendimento humano

---

### 🧾 Serviços disponíveis

Inclui solicitações como:

* Filiação
* Atualização de dados
* Carteirinha
* Convite e reserva de clube
* Agendamento de hospedagem
* Atendimento jurídico
* Atendimento financeiro
* Comunicação institucional
* SINTET Palmas

---

### ❓ Perguntas frequentes

Respostas automatizadas para:

* Localização da sede
* Horário de atendimento
* Serviços oferecidos
* Notícias e eventos

---

### 👤 Atendimento humano

Quando necessário, o sistema:

* Cria tickets automáticos
* Encaminha para grupos de atendimento
* Permite resposta de atendentes via comandos internos
* Registra histórico de mensagens do cliente

---

### 🎫 Sistema de tickets

* Geração automática de protocolo
* Classificação por setor
* Controle de status (aberto, em processo, fechado)
* Histórico de conversas
* Resumo automático para atendentes

---

### 💬 Comandos internos (grupos de atendimento)

* `/tickets` → lista todos os chamados do setor
* `/assumir <protocolo>` → assume atendimento
* `/encerrar <protocolo>` → finaliza atendimento
* `/meustickets` → mostra tickets do atendente

---

## 📦 Arquivos .BAT (automação do projeto)

O projeto conta com três arquivos `.bat` para facilitar execução no Windows:

### 🟢 `instalador_bot.bat`

* Instala automaticamente todas as dependências do projeto (`npm install`)
* Garante que o ambiente esteja pronto para execução

---

### ▶️ `executar_bot.bat`

* Inicia o chatbot
* Executa o arquivo principal Node.js
* Abre o WhatsApp Web automaticamente via Puppeteer

---

### 🧹 `limpar_qrcode.bat`

* Remove sessões salvas do WhatsApp Web.js (`LocalAuth`)
* Força a geração de um novo QR Code
* Útil em casos de erro de autenticação ou troca de conta

---

## 🔐 Segurança e controle

* Controle de estado por usuário
* Proteção contra mensagens duplicadas
* Sistema de tickets isolado por contato
* Separação entre atendimento automático e humano

---

## 🏫 Contexto acadêmico

Este projeto foi desenvolvido como uma aplicação prática de conceitos de:

* Engenharia de software
* Sistemas distribuídos
* Integração de APIs
* Automação de atendimento
* Experiência do usuário (UX conversacional)

---

## 🤝 Parceria institucional

Projeto desenvolvido em parceria com o **SINTET – Palmas/TO**, com foco em melhorar o atendimento digital aos trabalhadores da educação.

---

## 📌 Considerações finais

Este sistema representa uma solução escalável de atendimento híbrido, permitindo automação de perguntas frequentes e triagem inteligente de demandas, reduzindo tempo de resposta e otimizando o trabalho humano.

---
