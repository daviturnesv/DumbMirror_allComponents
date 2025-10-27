/*
 * PROJETO ESPELHO INTELIGENTE
*/

// --- Bibliotecas ---
#include <WiFi.h>
#include <PubSubClient.h>
#include "ArduinoJson.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

// --- Configurações de Rede ---
const char* ssid = "G973F-2004";
const char* password = "davi1234";
const char* mqtt_server = "192.168.2.215";

// --- Clientes de Rede ---
WiFiClient espClient;
PubSubClient client(espClient);

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

// --- Variáveis de Controlo de Tempo ---
unsigned long lastDisplayUpdate = 0;
unsigned long lastNetworkReconnectAttempt = 0;
unsigned long lastSensorPublish = 0;
const unsigned long SENSOR_PUBLISH_INTERVAL_MS = 5000;

// Smoothing simples (média móvel) para leituras de temperatura/umidade
float lastTemp = NAN;
float lastHum = NAN;
const float SMOOTH_ALPHA = 0.5f; // 0..1 (quanto maior, mais peso ao valor novo)

// --- Variáveis de Estado ---
int currentPage = 0;
const int totalPages = 3;
bool relayState = false;
bool lastBtn1State = HIGH;
bool lastBtn2State = HIGH;
bool lastBtn3State = HIGH;

// --- Declarações de Funções ---
void setupPins();
void setupSensorsAndDisplay();
void handleNetwork();
void handleButtons();
void updateDisplay();
void publishSensorData();

// --- Funções de Setup ---
void setup() {
  Serial.begin(115200);
  Serial.println("\nIniciando Projeto com MQTT...");

  setupPins();
  setupSensorsAndDisplay();

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  
  client.setServer(mqtt_server, 1883); 
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

// --- Definições das Funções ---
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
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("Falha ao iniciar display OLED"));
    for(;;);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Sistema Estavel!");
  display.display();
  delay(2000);
}

void handleNetwork() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastNetworkReconnectAttempt > 5000) {
      Serial.print("Tentando conectar a rede Wi-Fi...");
      WiFi.begin(ssid, password);
      lastNetworkReconnectAttempt = millis();
    }
    return;
  }

  if (!client.connected()) {
    if (millis() - lastNetworkReconnectAttempt > 5000) {
      Serial.print("Tentando conectar ao MQTT Broker...");
      if (client.connect("ESP32_SmartMirror")) {
        Serial.println(" Conectado!");
      } else {
        Serial.print(" Falhou, rc=");
        Serial.print(client.state());
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
    if (isnan(lastTemp)) lastTemp = t; else lastTemp = (SMOOTH_ALPHA * t) + (1.0f - SMOOTH_ALPHA) * lastTemp;
  }
  if (!isnan(h)) {
    if (isnan(lastHum)) lastHum = h; else lastHum = (SMOOTH_ALPHA * h) + (1.0f - SMOOTH_ALPHA) * lastHum;
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
  Serial.print("Dados publicados (" ); Serial.print(ok ? "OK" : "FALHA" ); Serial.print("): ");
  Serial.println(buffer);
}

void handleButtons() {
    bool c1 = digitalRead(TOUCH_BTN_1_PIN), c2 = digitalRead(TOUCH_BTN_2_PIN), c3 = digitalRead(TOUCH_BTN_3_PIN);
    if (c1 == LOW && lastBtn1State == HIGH) { relayState = !relayState; digitalWrite(RELAY_PIN, !relayState); }
    if (c2 == LOW && lastBtn2State == HIGH) { currentPage = (currentPage + 1) % totalPages; }
    if (c3 == LOW && lastBtn3State == HIGH) { currentPage = (currentPage - 1 + totalPages) % totalPages; }
    lastBtn1State = c1; lastBtn2State = c2; lastBtn3State = c3;
}

void updateDisplay() {
  display.clearDisplay();
  display.setCursor(0, 0);
  switch (currentPage) {
    case 0:
      display.println("--- Pagina Principal ---"); display.println(""); display.print("Rele: ");
      display.println(relayState ? "LIGADO" : "DESLIGADO"); break;
    case 1:
      display.println("--- Dados Sensores ---"); display.print("Temp: "); display.print(dht.readTemperature(), 1); display.println(" C");
      display.print("Umid: "); display.print(dht.readHumidity(), 0); display.println(" %"); display.print("Luz: ");
      display.print(map(analogRead(LDR_PIN), 0, 4095, 100, 0)); display.println(" %"); display.print("Movimento: ");
      display.println((digitalRead(PIR_PIN) == HIGH) ? "SIM" : "NAO"); break;
    case 2:
      display.println("--- Status da Rede ---"); display.print("Wi-Fi: ");
      display.println((WiFi.status() == WL_CONNECTED) ? "Conectado" : "Conectando...");
      display.print("IP: "); display.println(WiFi.localIP()); display.print("MQTT Broker: ");
      display.println(client.connected() ? "Conectado" : "Desconectado"); break;
  }
  display.display();
}
