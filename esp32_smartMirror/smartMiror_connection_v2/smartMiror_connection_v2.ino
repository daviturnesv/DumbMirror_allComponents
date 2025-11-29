/*
 * PROJETO ESPELHO INTELIGENTE - V2 (modo Wi-Fi/MQTT configurável)
 */

// --- Bibliotecas ---
#include <WiFi.h>
#include <PubSubClient.h>
#include "ArduinoJson.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <Preferences.h>

// --- Estruturas de configuração ---
struct NetworkConfig {
  const char *name;
  const char *ssid;
  const char *password;
};

struct BrokerConfig {
  const char *name;
  const char *host;
};

// --- Redes Wi-Fi e Brokers conhecidos ---
NetworkConfig knownNetworks[] = {
  {"Rede de casa", "ANDREeCLEIDE_2G", "1971197217502"},
  {"Hotspot Celular", "G973F-2004", "davi1234"}
};
const int knownNetworksCount = sizeof(knownNetworks) / sizeof(knownNetworks[0]);

BrokerConfig knownBrokers[] = {
  {"IP do Note em casa", "192.168.0.86"},
  {"IP do Note fora", "192.168.23.215"}
};
const int knownBrokersCount = sizeof(knownBrokers) / sizeof(knownBrokers[0]);

// Índices de seleção atual (persistidos)
int selectedNetworkIndex = 0;
int selectedBrokerIndex = 0;

// --- Clientes de Rede ---
WiFiClient espClient;
PubSubClient client(espClient);
Preferences preferences;

// --- Definição dos Pinos ---
#define OLED_SDA_PIN 4
#define OLED_SCL_PIN 5
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define DHT_PIN 15
#define DHT_TYPE DHT11
#define LDR_PIN 6
#define PIR_PIN 7
#define TOUCH_BTN_1_PIN 12
#define TOUCH_BTN_2_PIN 13
#define TOUCH_BTN_3_PIN 14
#define RELAY_PIN 16

// --- Instâncias dos Componentes ---
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
DHT dht(DHT_PIN, DHT_TYPE);

// --- Variáveis de Tempo ---
unsigned long lastDisplayUpdate = 0;
unsigned long lastNetworkReconnectAttempt = 0;
unsigned long lastSensorPublish = 0;
unsigned long btn1PressStart = 0;
const unsigned long SENSOR_PUBLISH_INTERVAL_MS = 5000;
const unsigned long BUTTON_HOLD_MS = 1200;

// Smoothing simples (média móvel) para leituras de temperatura/umidade
float lastTemp = NAN;
float lastHum = NAN;
const float SMOOTH_ALPHA = 0.5f; // 0..1

// --- Variáveis de Estado ---
int currentPage = 0;
const int totalPages = 3;
bool relayState = false;
bool lastBtn1State = HIGH;
bool lastBtn2State = HIGH;
bool lastBtn3State = HIGH;
bool selectionMode = false; // false = escolher rede, true = escolher broker
bool selecting = false;     // indica se estou navegando na lista
bool btn1BlockHold = false; // evita reentrar em modo seleção logo após confirmar

// --- Declarações ---
void setupPins();
void setupSensorsAndDisplay();
void loadPreferences();
void savePreferences();
void connectWiFi();
void connectMQTT();
void handleNetwork();
void handleButtons();
void updateDisplay();
void publishSensorData();
void renderSelectionOverlay();

// --- Setup ---
void setup() {
  Serial.begin(115200);
  Serial.println("\nIniciando Projeto com MQTT - V2");

  preferences.begin("mirror-cfg", false);
  loadPreferences();

  setupPins();
  setupSensorsAndDisplay();

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);

  connectWiFi();
  connectMQTT();
}

void loop() {
  handleNetwork();
  handleButtons();

  if (millis() - lastDisplayUpdate > 1000) {
    lastDisplayUpdate = millis();
    updateDisplay();
  }

  if (client.connected() && millis() - lastSensorPublish > SENSOR_PUBLISH_INTERVAL_MS) {
    lastSensorPublish = millis();
    publishSensorData();
  }
}

// --- Implementações ---
void setupPins() {
  pinMode(PIR_PIN, INPUT_PULLUP);
  pinMode(TOUCH_BTN_1_PIN, INPUT_PULLUP);
  pinMode(TOUCH_BTN_2_PIN, INPUT_PULLUP);
  pinMode(TOUCH_BTN_3_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
}

void setupSensorsAndDisplay() {
  dht.begin();
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("Falha ao iniciar display OLED"));
    for (;;)
      ;
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Sistema Estavel V2!");
  display.display();
  delay(1500);
}

void loadPreferences() {
  selectedNetworkIndex = preferences.getInt("netIndex", 0);
  selectedBrokerIndex = preferences.getInt("brokerIndex", 0);
  if (selectedNetworkIndex < 0 || selectedNetworkIndex >= knownNetworksCount) {
    selectedNetworkIndex = 0;
  }
  if (selectedBrokerIndex < 0 || selectedBrokerIndex >= knownBrokersCount) {
    selectedBrokerIndex = 0;
  }
}

void savePreferences() {
  preferences.putInt("netIndex", selectedNetworkIndex);
  preferences.putInt("brokerIndex", selectedBrokerIndex);
}

void connectWiFi() {
  NetworkConfig &net = knownNetworks[selectedNetworkIndex];
  Serial.printf("Conectando a rede %s (%s)\n", net.name, net.ssid);
  WiFi.begin(net.ssid, net.password);
}

void connectMQTT() {
  BrokerConfig &broker = knownBrokers[selectedBrokerIndex];
  client.setServer(broker.host, 1883);
  Serial.printf("Broker selecionado: %s (%s)\n", broker.name, broker.host);
}

void handleNetwork() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastNetworkReconnectAttempt > 5000) {
      Serial.println("Tentando reconectar Wi-Fi...");
      connectWiFi();
      lastNetworkReconnectAttempt = millis();
    }
    return;
  }

  if (!client.connected()) {
    if (millis() - lastNetworkReconnectAttempt > 5000) {
      Serial.print("Conectando MQTT...");
      if (client.connect("ESP32_SmartMirror")) {
        Serial.println(" conectado!");
      } else {
        Serial.print(" falhou, rc=");
        Serial.println(client.state());
      }
      lastNetworkReconnectAttempt = millis();
    }
  } else {
    client.loop();
  }
}

void publishSensorData() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    if (isnan(lastTemp))
      lastTemp = t;
    else
      lastTemp = (SMOOTH_ALPHA * t) + (1.0f - SMOOTH_ALPHA) * lastTemp;
  }
  if (!isnan(h)) {
    if (isnan(lastHum))
      lastHum = h;
    else
      lastHum = (SMOOTH_ALPHA * h) + (1.0f - SMOOTH_ALPHA) * lastHum;
  }

  int rawLdr = analogRead(LDR_PIN);
  int lightPct = map(rawLdr, 0, 4095, 100, 0);

  StaticJsonDocument<200> doc;
  if (!isnan(lastTemp)) {
    doc["temperature"] = lastTemp;
  }
  if (!isnan(lastHum)) {
    doc["humidity"] = lastHum;
  }
  doc["light"] = lightPct;
  doc["motion"] = (digitalRead(PIR_PIN) == HIGH);

  char buffer[200];
  size_t n = serializeJson(doc, buffer, sizeof(buffer));
  bool ok = client.publish("smartmirror/sensors", buffer, n);
  Serial.print("Dados publicados (");
  Serial.print(ok ? "OK" : "FALHA");
  Serial.print("): ");
  Serial.println(buffer);
}

void handleButtons() {
  bool c1 = digitalRead(TOUCH_BTN_1_PIN);
  bool c2 = digitalRead(TOUCH_BTN_2_PIN);
  bool c3 = digitalRead(TOUCH_BTN_3_PIN);

  if (c1 == HIGH && lastBtn1State == LOW) {
    // botão foi solto, reabilita detecção de hold
    btn1BlockHold = false;
  }

  // Deteção de clique simples
  if (c1 == LOW && lastBtn1State == HIGH) {
    if (selecting) {
      // Confirma seleção atual
      selecting = false;
      if (!selectionMode) {
        connectWiFi();
      } else {
        connectMQTT();
        client.disconnect();
      }
      savePreferences();
      btn1BlockHold = true; // evita reabrir seleção enquanto o botão ainda está pressionado
    } else {
      relayState = !relayState;
      digitalWrite(RELAY_PIN, !relayState);
      btn1BlockHold = false;
    }
    btn1PressStart = millis();
  }

  // Deteção de clique longo para entrar no modo seleção
  if (c1 == LOW && lastBtn1State == LOW) {
    if (!selecting && !btn1BlockHold && (millis() - btn1PressStart > BUTTON_HOLD_MS)) {
      selecting = true;
      selectionMode = !selectionMode; // alterna entre redes e brokers
      btn1PressStart = millis();
    }
  }

  if (c2 == LOW && lastBtn2State == HIGH) {
    if (selecting) {
      if (!selectionMode) {
        selectedNetworkIndex = (selectedNetworkIndex + 1) % knownNetworksCount;
      } else {
        selectedBrokerIndex = (selectedBrokerIndex + 1) % knownBrokersCount;
      }
    } else {
      currentPage = (currentPage + 1) % totalPages;
    }
  }

  if (c3 == LOW && lastBtn3State == HIGH) {
    if (selecting) {
      if (!selectionMode) {
        selectedNetworkIndex = (selectedNetworkIndex - 1 + knownNetworksCount) % knownNetworksCount;
      } else {
        selectedBrokerIndex = (selectedBrokerIndex - 1 + knownBrokersCount) % knownBrokersCount;
      }
    } else {
      currentPage = (currentPage - 1 + totalPages) % totalPages;
    }
  }

  lastBtn1State = c1;
  lastBtn2State = c2;
  lastBtn3State = c3;
}

void updateDisplay() {
  display.clearDisplay();
  display.setCursor(0, 0);

  if (selecting) {
    renderSelectionOverlay();
    display.display();
    return;
  }

  switch (currentPage) {
  case 0:
    display.println("--- Pagina Principal ---");
    display.println("");
    display.print("Rele: ");
    display.println(relayState ? "LIGADO" : "DESLIGADO");
    break;
  case 1:
    display.println("--- Dados Sensores ---");
    display.print("Temp: ");
    display.print(dht.readTemperature(), 1);
    display.println(" C");
    display.print("Umid: ");
    display.print(dht.readHumidity(), 0);
    display.println(" %");
    display.print("Luz: ");
    display.print(map(analogRead(LDR_PIN), 0, 4095, 100, 0));
    display.println(" %");
    display.print("Movimento: ");
    display.println((digitalRead(PIR_PIN) == HIGH) ? "SIM" : "NAO");
    break;
  case 2:
    display.println("--- Status da Rede ---");
    display.print("Rede: ");
    display.println(knownNetworks[selectedNetworkIndex].name);
    display.print("Wi-Fi: ");
    display.println((WiFi.status() == WL_CONNECTED) ? "Conectado" : "Conectando...");
    display.print("IP: ");
    if (WiFi.status() == WL_CONNECTED) {
      display.println(WiFi.localIP());
    } else {
      display.println("0.0.0.0");
    }
    display.print("Broker: ");
    display.println(knownBrokers[selectedBrokerIndex].name);
    display.print("MQTT: ");
    display.println(client.connected() ? "Conectado" : "Desconectado");
    display.println("");
    display.println("Segure BTN1 p/ selecionar");
    break;
  }
  display.display();
}

void renderSelectionOverlay() {
  display.println("== Modo Selecionar ==");
  if (!selectionMode) {
    display.println("Rede Wi-Fi:");
    for (int i = 0; i < knownNetworksCount; ++i) {
      if (i == selectedNetworkIndex)
        display.print("> ");
      else
        display.print("  ");
      display.println(knownNetworks[i].name);
    }
    display.println("");
    display.println("BTN1: confirmar");
  } else {
    display.println("MQTT Broker:");
    for (int i = 0; i < knownBrokersCount; ++i) {
      if (i == selectedBrokerIndex)
        display.print("> ");
      else
        display.print("  ");
      display.println(knownBrokers[i].name);
    }
    display.println("");
    display.println("BTN1: confirmar");
  }
  display.println("BTN2/BTN3: navegar");
}