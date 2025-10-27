# MMM-SensorData

MagicMirror² module para exibir dados de sensores enviados por um ESP32 via MQTT.

## Funcionalidades

| Categoria | Descrição |
|-----------|-----------|
| MQTT | Conecta a broker (ex: Mosquitto) e subscreve tópico (`smartmirror/sensors`). |
| Sensores | JSON com `temperature`, `humidity`, `light`, `motion`. Campos ausentes são ignorados. |
| UI | Ícones Font Awesome, estado de conexão (Ligando / OK / Offline / Inactive), indicador de dados desatualizados. |
| Persistência | SQLite (preferencial) com retenção configurável; fallback automático JSON. Migração automática JSON→SQLite. |
| Histórico | Sparklines para temperatura, humidade e luz. |
| Performance | PRAGMAs de otimização, logging periódico de estatísticas, downsampling opcional para reduzir crescimento. |
| Resiliência | Simulação opcional de dados se MQTT indisponível (`simulateIfNoMqtt`). |
| Manutenção | Purga de dados antigos, downsampling configurável, opções de backends. |

### Novidades recentes

- `dbStatsIntervalMinutes` (log periódico de tamanho/linhas)
- Downsampling real (agregação em buckets e remoção de linhas brutas antigas) quando `downsample: true`
- Opções de janela de retenção de dados brutos (`downsampleKeepRawHours`) e tamanho do bucket (`downsampleIntervalMinutes`)
- Simulação automática quando não há MQTT (`simulateIfNoMqtt: true`)

## Instalação

1. Copiar a pasta `MMM-SensorData` para `modules/` da sua instalação MagicMirror².
1. Entrar na pasta e instalar dependências:

```bash
npm install
```

1. Adicionar configuração ao seu `config/config.js` (ver abaixo).

## Configuração de Exemplo

```javascript
{
  module: "MMM-SensorData",
  position: "top_right", // ou a região que preferir
  config: {
    mqttServer: "mqtt://localhost:1883", // URL do broker
    topic: "smartmirror/sensors",
    decimals: 1,
    motionTextOn: "Movimento Detectado",
    motionTextOff: "Nenhum Movimento",
    lightUnit: "lx",
    showStatus: true,
  // Persistência (opcional)
  enablePersistence: true,
  dbPath: "data/sensordata.db",
  persistenceBackend: 'auto', // 'auto' | 'sqlite' | 'json'
  retentionDays: 30,          // purga leituras mais antigas que X dias
  dbStatsIntervalMinutes: 60, // loga estatísticas a cada X min (0 = desativa)
    // Staleness (dados antigos)
    staleAfterSeconds: 60,
    staleIndicatorText: "(desatualizado)",
    showLastUpdate: true,
  // Refresh automático do DOM (tempo desde última atualização)
  uiRefreshSeconds: 10,
    // Marcar estado como inactive (sem dados) após X seg sem mensagens
  deviceInactivitySeconds: 120,
  // Histórico / Gráficos
  historyMinutes: 180,            // janela de histórico (minutos) a buscar
  showCharts: true,               // mostrar ou ocultar blocos de gráfico
  chartWidth: 160,                // largura canvas (px)
  chartHeight: 30,                // altura canvas (px)
  chartLineColor: "#6cc070",      // cor linha
  chartFillColor: "rgba(108,192,112,0.25)", // cor preenchimento (defina null para remover)
  chartStrokeWidth: 1,            // espessura da linha
  chartDecimals: 1,               // casas decimais no label do gráfico
  chartRefreshSeconds: 120,       // frequência de atualização do histórico
  // Downsampling (reduz crescimento ao longo do tempo)
  downsample: true,               // ativa agregação (requer SQLite)
  downsampleIntervalMinutes: 5,   // tamanho do bucket agregado
  downsampleKeepRawHours: 12,     // manter leituras cruas recentes por X horas
  downsamplePurgeRaw: true,       // remover linhas brutas antigas após agregar
  downsampleRunIntervalMinutes: 30, // periodicidade da tarefa de downsampling
    // Opcional: ícones / textos custom de status
  statusText: {
      connecting: "Ligando MQTT...",
      connected: "MQTT OK",
      disconnected: "MQTT offline",
      inactive: "Sem dados recentes"
    }
  // simulateIfNoMqtt: true // gera dados sintéticos se broker indisponível
    // reconnectPeriod: 2000 // ms (default ~1000)
  }
}

## Estrutura da Mensagem Esperada

Publicar JSON no tópico configurado, por exemplo:

```json
{
  "temperature": 23.4,
  "humidity": 55.1,
  "light": 120,
  "motion": true
}
```

Campos ausentes serão simplesmente ignorados.

## Dependências

- `mqtt` (para receber dados em tempo real)
- `better-sqlite3` (opcional; se falhar o módulo usa fallback JSON)

Instale normalmente:

```bash
npm install
```

Se `better-sqlite3` não compilar, o módulo irá gravar em um arquivo JSON (mesmo caminho do `dbPath` trocando `.db` por `.json`). Você ainda terá histórico e gráficos, apenas sem vantagem de consultas SQL. Quando conseguir compilar depois, basta instalar e reiniciar: ele migrará continuando a usar SQLite (o JSON antigo permanece).

### Forçando backend

```javascript
persistenceBackend: 'json'   // nunca tenta better-sqlite3, sem warnings
// ou
persistenceBackend: 'sqlite' // somente sqlite; se falhar, fica sem persistência
```

Em modo `auto`, se um JSON existir e o SQLite começar a funcionar depois, os dados JSON são migrados uma vez para a tabela e o arquivo original é renomeado com sufixo `.migrated.bak`.

## Downsampling (Agregação de Dados)

Quando ativado (`downsample: true`) e usando SQLite:

1. Leituras cruas recentes (últimas `downsampleKeepRawHours` horas) permanecem na tabela `sensor_readings`.
2. Leituras mais antigas são agregadas em buckets de `downsampleIntervalMinutes` minutos e gravadas em `sensor_readings_ds`.
3. Cada bucket contém valores agregados (média) para temperatura, humidade e luz; para `motion` é usado `MAX` (se houve algum movimento no intervalo o valor será 1).
4. Após agregação, se `downsamplePurgeRaw` for `true`, as linhas cruas daquele período são removidas, reduzindo crescimento do ficheiro.

Parâmetros principais:

| Chave | Default | Descrição |
|-------|---------|-----------|
| `downsample` | `false` | Ativa recurso. |
| `downsampleIntervalMinutes` | `5` | Duração de cada bucket agregado. |
| `downsampleKeepRawHours` | `12` | Janela de detalhes em alta resolução mantida sem agregação. |
| `downsamplePurgeRaw` | `true` | Remove dados brutos antigos após agrupar. |
| `downsampleRunIntervalMinutes` | `30` | Frequência da tarefa de agregação. |

### Como o histórico é servido


Pedidos de histórico (`historyMinutes`) retornam:

- Dados agregados da tabela `sensor_readings_ds` para o período anterior a `downsampleKeepRawHours`.
- Dados brutos recentes para a parte mais nova da janela.
- Os resultados já vêm ordenados por timestamp.

### Desativando / Ajustando

Para desativar totalmente, defina `downsample: false`.
Para reduzir mais o tamanho, aumente `downsampleIntervalMinutes` ou diminua `downsampleKeepRawHours`.

### Modo Automático (`downsample: 'auto'`)

Se definido como `'auto'`, o módulo monitora o crescimento e ativa a agregação quando QUALQUER critério for atingido:

- Linhas > 50.000
- Tamanho do arquivo > 30 MB
- Janela temporal coberta > 72 horas

Até lá, todos os dados permanecem crus (máxima resolução). Após ativado, segue mesmo fluxo descrito acima.

## Estatísticas de Banco (dbStatsIntervalMinutes)

Define periodicidade (minutos) para logar: número de linhas, janela temporal coberta e tamanho em MB do arquivo. Útil para calibrar parâmetros de retenção e downsampling. Defina `0` ou omita para desativar.

## Notas sobre Gráficos

Os gráficos são simples "sparklines" desenhados em `<canvas>` sem bibliotecas externas. Para janelas muito grandes (ex: várias horas com leituras a cada poucos segundos) o desempenho pode degradar; se notar lentidão:

- Aumente `chartRefreshSeconds` (menos fetch de histórico)
- Reduza `historyMinutes`
- Desative (`showCharts: false`) ou ative downsampling (já implementado) para reduzir densidade de pontos

Valores ausentes (null) são ignorados na série. A última leitura válida aparece no label do gráfico.

## Exportação CSV

Ative com `exportButton: true`. Um botão "Export CSV" aparece no bloco do módulo. Ao clicar:

1. Gera arquivo em `exportDir` (default `data/`).
2. Janela exportada = últimos `exportSinceMinutes` minutos (default 1440 = 24h).
3. Nome: `sensordata_export_YYYY-MM-DDTHH-mm-ssZ.csv`.

Colunas:

| Coluna | Descrição |
|--------|-----------|
| ts | Epoch ms |
| iso | Timestamp ISO8601 |
| temperature | Temperatura (°C) |
| humidity | Humidade (%) |
| light | Luz (lux) |
| motion | 0/1 (movimento detectado em leitura) |
| aggregated | 1 se linha veio da tabela agregada (`sensor_readings_ds`), 0 se crua |

Após exportar, uma linha de status mostra quantidade de linhas e caminho do ficheiro. O UI também exibe uma pequena legenda indicando a partir de que horário os dados são agregados quando aplicável.

### Controle sem toque / automação

Novas opções:

| Chave | Default | Descrição |
|-------|---------|-----------|
| `autoExportIntervalMinutes` | `0` | Se > 0, executa exportação automática periódica. |
| `broadcastSummary` | `false` | Envia notificação `SENSORDATA_SUMMARY` (para outros módulos) a cada atualização de sensor. |

Notificações que o módulo aceita (via `sendNotification` de outro módulo, ex: módulo de voz/gestos):

| Notificação | Payload | Ação |
|-------------|---------|------|
| `SENSORDATA_EXPORT` | (ignorado) | Dispara exportação CSV agora |
| `SENSORDATA_REFRESH_HISTORY` | (ignorado) | Força recarregar histórico completo |
| `SENSORDATA_COMMAND` | `'export'` ou `{action:'export'}` | Exporta |
| `SENSORDATA_COMMAND` | `'refreshHistory'` ou `{action:'refreshHistory'}` | Recarrega histórico |

Se `broadcastSummary: true`, a notificação emitida tem forma:

```js
{
  notification: 'SENSORDATA_SUMMARY',
  payload: { ts, temperature, humidity, light, motion }
}
```

## Licença

MIT
