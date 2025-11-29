# DumbMirror AI Guide

## Idioma Padrão
- Sempre responda em português do Brasil (pt-BR), tanto na conversa quanto em comentários ou mensagens geradas no código.

## Arquitetura e Fluxo
- O DumbMirror está dividido em um serviço Relay (`src/`), front-end MagicMirror (`MagicMirror-master-Original/`) e clientes móveis/IoT; o Relay faz o intermédio de comandos entre usuários autenticados e os espelhos.
- Endpoints REST permitem que o app Android registre/login e administre espelhos, enquanto Socket.IO (namespace `/mirror`) envia comandos para instâncias MagicMirror que se autenticam com `mirrorId` + `secret`.
- MongoDB Atlas armazena `users` e `mirrors`; IDs são expostos como strings para que o código cliente nunca manipule `ObjectId`s diretamente.

## Implementação do Servidor Relay
- `src/server.js` cria o app Express, conecta a autenticação, CRUD de mirrors e comportamentos de sockets; reutilize o helper `asyncHandler` fornecido e o middleware `authenticateRequest` para novas rotas.
- Helpers de banco em `src/db.js` cuidam de hashing (bcrypt) e garantem índices—sempre chame estes em vez de acessar diretamente as coleções do Mongo.
- `src/auth.js` centraliza criação/validação de JWT (tokens `Bearer`, TTL de 7 dias); novas rotas protegidas devem chamar `authenticateRequest` para popular `req.user`.
- Respostas de erro retornam consistentemente `{ error: string }`; mantenha esse formato para as expectativas do cliente e testes existentes.

## Desenvolvimento Local & Testes
- Instale Node 18+, `npm install`, depois `npm run dev` para hot reload ou `npm start` para execução estática; variáveis de ambiente vivem em `.env` (veja `relay-server/README.md`).
- `tests/relay.e2e.test.mjs` roda com Ava + `mongodb-memory-server`; siga esse padrão para novos testes para evitar dependências do Atlas real.
- `npm test` executa a suíte Ava; scripts de smoke baseados em curl (`relay-server/smoke-test.js`) atingem `/health`, `/api/users`, `/api/auth/login` contra deployments locais ou no Render (`SMOKE_URL`).
- Helpers de debug TLS (`relay-server/tls-check.js`, `relay-server/test-mongo.js`) esperam variáveis de ambiente e são a forma canônica de verificar a conectividade com o Atlas antes de rodar o serviço.

## Integração com MagicMirror
- O config de exemplo do MagicMirror em `MagicMirror-master-Original/config/config.js` mostra como os espelhos se conectam: atualize `relayUrl`, `mirrorId` e `secret` por ambiente ao testar.
- Os espelhos devem emitir `authenticate` com o secret imediatamente após conectar; o servidor transmite `mirror-status` e `command-result`, então módulos customizados devem escutar esses eventos.
- Módulos do MagicMirror em `MagicMirror-master-Original/modules/` são em sua maioria padrões; trabalho específico do projeto deve ficar em módulos dedicados em vez de modificar o core.

## Padrões & Convenções
- Todas as novas rotas devem ser adicionadas em `src/server.js`; mantenha a validação de requisição mínima porém explícita (retorne `400` com `{ error }` para campos faltando).
- Use `configureDatabase` se precisar sobrescrever detalhes de conexão dentro de testes ou scripts; o código de produção lê de `config` apenas uma vez.
- Handlers de socket armazenam estado no mapa `mirrorConnections` (`mirrorId` -> `{ socket, ownerId, lastSeen }`); estenda essa estrutura em vez de criar registros paralelos.
- Logue usando `console.*` com prefixos `[context]`, combinando com o estilo existente para facilitar filtragem nos logs do Render.
- Após qualquer modificação relevante (feature nova ou correção de bug), gere um arquivo em `Andamento/` nomeado com timestamp (`YYYY-MM-DD-HHmmss.md`) explicando o que foi alterado e descrevendo o estado atual do código para sincronizar os agentes em máquinas diferentes.

## Notas Legadas
- Os antigos scripts SQLite em `scripts/list.mjs` e `scripts/reset-db.mjs` estão obsoletos (referenciam APIs removidas); evite invocá-los até que sejam reescritos para MongoDB.
- `README_SUMMARY.md` em `relay-server/` documenta a migração Atlas/Render—consulte-o antes de alterar pressupostos de deploy.
