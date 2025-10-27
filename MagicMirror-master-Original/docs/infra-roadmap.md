# DumbMirror Remote Control Infrastructure Roadmap

> Status: 2025-10-24

## 1. Context Snapshot
- MagicMirror² running on Windows with MMM-Remote-Control module.
- PWA served at `http://<espelho-ip>:8080/remote.html` com Service Worker v1.4.0.
- Instalação via "Adicionar à tela inicial" já funciona (standalone) em HTTP.
- Comunicação entre espelho e app ainda depende de mesma LAN; dados de sensores/câmera locais.

## 2. Objetivo de Infraestrutura
Garantir acesso remoto seguro (fora da mesma rede) para controlar o espelho, receber telemetria (sensores, câmera, dados históricos) e aplicar comandos pelo PWA/mobile.

## 3. Visão Geral da Arquitetura Proposta
1. **Backend público**: API/serviço exposto em HTTPS (REST ou WebSocket/MQTT) hospedado em nuvem ou servidor dedicado.
2. **Espelho (Edge)**: Cliente que publica dados e consome comandos do backend.
3. **Aplicativo (PWA/mobile)**: Consome API pública, envia comandos autenticados, exibe dados.
4. **Autenticação e Segurança**: TLS obrigatório, tokens (JWT ou API key rotativa), rate limiting e auditoria.

## 4. Fases Recomendadas

### Fase 1 - Preparação e Inventário (1-2 dias)
- Validar requisitos de conectividade (porta, largura de banda, privacidade).
- Escolher provedor (ex.: Azure VM/App Service, AWS EC2, Google Cloud Run) ou utilizar servidor doméstico com DNS + certificação Lets Encrypt.
- Definir domínio público (subdomínio dedicado, ex.: `api.dumbmirror.com`).
- Revisar dados sensíveis (imagens, áudio, health); aplicar políticas LGPD.

### Fase 2 - Backend Seguro (3-5 dias)
- Criar projeto backend (Node.js/NestJS ou FastAPI) com endpoints:
  - `POST /auth/login` (JWT)
  - `POST /mirror/events` (dados de sensores)
  - `GET /mirror/state` (estado agregado)
  - `POST /mirror/commands` (enfileirar comandos)
  - `WS /mirror/stream` ou MQTT para atualização em tempo real.
- Integrar banco (MongoDB, PostgreSQL ou InfluxDB) para histórico.
- Configurar HTTPS (reverse proxy Nginx/Caddy) + firewall liberar portas necessárias.
- Implementar monitoramento básico (logs estruturados, alertas).

### Fase 3 - Integração Espelho -> Backend (2-4 dias)
- Adaptar MagicMirror:
  - Criar script/service Node que colete sensores, câmera e dados locais.
  - Publicar periodicamente no backend (`/mirror/events`).
  - Consumir fila de comandos e executar (ex.: ligar módulo, alterar config, screenshot).
  - Reforçar configuração (variáveis ambiente com tokens, retry com exponential backoff, watchdog em caso de queda de conexão).
- Configurar atualizações OTA se necessário (script para atualizar repositório).

### Fase 4 - Atualização PWA / Mobile (2-3 dias)
- Modificar `remote.js` para consumir a API pública (fetch/WS) ao invés de endpoints locais.
- Implementar login no PWA (JWT armazenado em IndexedDB ou session storage, renovação por refresh token).
- Exibir dashboards (sensores, gráficos) com dados do backend.
- Permitir comandos via API (detalhar payloads e feedback ao usuário).
- Ajustar Service Worker para cachear assets públicos e fallback offline.

### Fase 5 - Segurança e QA (2-4 dias)
- Revisar CORS, rate limiting, audit trail de comandos.
- Testar cenários adversos: perda de rede, token expirado, latência alta.
- Pentest básico/APIs: SQL injection, auth bypass, CSRF.
- Documentar fluxo de incidentes: revogar token, bloquear espelho perdido.

### Fase 6 - Observabilidade e Manutenção (contínuo)
- Configurar painel (Grafana/Prometheus ou serviço equivalente do provedor).
- Implementar alertas (CPU, memória, falha de heartbeat do espelho).
- Planejar backup automático de banco e gravações.
- Criar playbook de recovery (rede, certificados, infraestrutura).

## 5. Itens Técnicos Detalhados

### Backend
- Linguagem sugerida: Node.js (NestJS) ou Python (FastAPI) com suporte a WebSocket.
- Auth: JWT com refresh token, tempo curto para access token (15-30 min).
- Banco recomendado: PostgreSQL (estado e usuários) + Redis (fila de comandos).
- Storage (opcional): S3/Blob para snapshots de câmera.

### Comunicação em Tempo Real
- **Opção REST + Polling:** fácil, porém mais latência.
- **Opção WebSocket:** canal bidirecional (notificação instantânea de comandos/dados).
- **Opção MQTT:** ideal se já usa sensores/IoT (HiveMQ Cloud, EMQX, Mosquitto TLS).

### Espelho (cliente edge)
- Serviço Node que roda junto com MagicMirror (`pm2` ou `nssm` para Windows).
- Responsabilidades:
  - Autenticar no backend e renovar tokens.
  - Monitorar sensores (MQTT local, arquivos, APIs).
  - Enviar dados com carimbo de tempo.
  - Receber comandos e executar (via MMM-Remote-Control API local).

### PWA
- Router apontando para API pública (`https://api.dumbmirror.com`).
- Login + refresh token.
- Telas: dashboard, câmera (WebRTC/URL streaming), configurações modulares, histórico.
- Service Worker com cache versionado, fallback offline, sync em background.

### Segurança
- TLS obrigatório (Let's Encrypt automatizado).
- Configurar WAF/reverse proxy (Cloudflare, Nginx).
- Rate limiting e proteção contra brute-force.
- Logs de auditoria para cada comando enviado.

## 6. Backlog Recomendado
1. Provisionar infraestrutura de backend (VM ou container).
2. Implantar API base com autenticação.
3. Criar cliente do espelho para publicação de dados.
4. Refatorar PWA para consumir API externa.
5. Implementar dashboards e comandos remotos.
6. Hardening completo (TLS, logs, backup) e testes FIM.

## 7. Materiais de Apoio
- MMM-Remote-Control REST docs: https://github.com/Jopyth/MMM-Remote-Control
- NestJS WebSockets: https://docs.nestjs.com/websockets/gateways
- FastAPI + JWT: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
- TLS com Caddy (auto HTTPS): https://caddyserver.com/docs/automatic-https
- MQTT Cloud (HiveMQ): https://www.hivemq.com/mqtt-cloud-platform

---

> Próximos passos imediatos: decidir provedor/destino do backend, definir stack (REST, WebSocket ou MQTT) e agendar janela para integrar o espelho como cliente autenticado.
