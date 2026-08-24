# AlinhaCV

Aplicação para adaptar currículos a vagas sem inventar competências.

## Decisão técnica

TypeScript/Node.js é a escolha principal: permite uma API única, validação de arquivos no servidor, extração consistente de PDF/DOCX/TXT e compartilhamento de tipos com uma futura interface web. A interface atual em `outputs/index.html` é um protótipo; ela deve ser substituída por uma UI que chama `POST /api/analyze`.

## Fluxo seguro

1. Usuário envia currículo-base e vaga.
2. O servidor extrai o texto de PDF, DOCX ou TXT.
3. O agente compara requisitos com evidências do currículo.
4. O sistema gera currículo ajustado e relatório ATS.
5. O usuário revisa e aprova.
6. Uma integração de vagas pode buscar oportunidades e colocar candidaturas em fila, mas o envio final deve exigir confirmação humana.

## Rodar

```bash
npm install
copy .env.example .env
npm run dev
```

O agente aceita `openai`, `anthropic` e `opencode`, selecionados por `AI_PROVIDER`. OpenAI e OpenCode usam o protocolo compatível com OpenAI; para OpenCode, configure também `OPENCODE_BASE_URL` e `OPENCODE_MODEL`. Anthropic usa a API nativa. O restante da aplicação recebe o mesmo formato JSON independentemente do provedor.

## Template de currículo

O projeto incorpora o template LaTeX em `templates/pt-br/curriculo.tex`, baseado no repositório `celiobjunior/resume-template` e mantido sob Apache 2.0. O agente retorna o campo `latex` junto com a análise, pronto para ser compilado em PDF.

Sem a chave do provedor escolhido, a API responde em modo de demonstração.

## LinkedIn

O projeto não inclui login automatizado nem envio autônomo de candidaturas. Isso exigiria uma integração autorizada, gestão segura de sessão e confirmação antes de transmitir dados pessoais ou submeter uma candidatura. A próxima camada recomendada é um adaptador de busca que cria vagas em estado `discovered`, `review`, `approved` e `submitted`.
