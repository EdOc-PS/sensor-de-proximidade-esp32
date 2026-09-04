#include <WiFi.h>
#include <PubSubClient.h>

// ===== CONFIGURAÇÕES DE REDE =====
const char* ssid = "JoseSouza";
const char* password = "souza@5870";

// ===== CONFIGURAÇÕES MQTT =====
const char* mqtt_server = "192.168.2.168";  // IP do seu PC
const int mqtt_port = 1883;
const char* mqtt_client_id = "esp32-alarme-01";
const char* topico_telemetria = "alarme/sensor/pir";

// ===== CONFIGURAÇÃO DO SENSOR =====
const int pinoPIR = 2;  // D2

// ===== OBJETOS =====
WiFiClient espClient;
PubSubClient client(espClient);

// ===== VARIÁVEIS DE CONTROLE =====
unsigned long ultimaTentativaReconexaoWifi = 0;
const long intervaloReconexaoWifi = 5000;

unsigned long ultimaTentativaReconexaoMqtt = 0;
const long intervaloReconexaoMqtt = 5000;

int estadoAnteriorPIR = LOW;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(pinoPIR, INPUT);

  conectarWiFi();
  client.setServer(mqtt_server, mqtt_port);

  Serial.println("Aguardando o PIR estabilizar (30 segundos)...");
  delay(30000);
  Serial.println("Pronto! Sistema operando.");
}

void loop() {
  // Verifica Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long agora = millis();
    if (agora - ultimaTentativaReconexaoWifi >= intervaloReconexaoWifi) {
      ultimaTentativaReconexaoWifi = agora;
      Serial.println("Wi-Fi caiu! Tentando reconectar...");
      conectarWiFi();
    }
  }

  // Verifica MQTT
  if (WiFi.status() == WL_CONNECTED && !client.connected()) {
    unsigned long agora = millis();
    if (agora - ultimaTentativaReconexaoMqtt >= intervaloReconexaoMqtt) {
      ultimaTentativaReconexaoMqtt = agora;
      conectarMQTT();
    }
  }

  client.loop(); // mantém a conexão MQTT viva

  // Lê o PIR e publica SOMENTE quando o estado mudar
  int leituraPIR = digitalRead(pinoPIR);

  if (leituraPIR != estadoAnteriorPIR) {
    estadoAnteriorPIR = leituraPIR;

    if (leituraPIR == HIGH) {
      Serial.println("Movimento detectado! Publicando...");
      publicarTelemetria(true);
    } else {
      Serial.println("Movimento cessou. Publicando...");
      publicarTelemetria(false);
    }
  }

  delay(100); // pequena pausa pra não sobrecarregar o loop
}

// ===== FUNÇÃO: Conectar ao Wi-Fi =====
void conectarWiFi() {
  Serial.println("Conectando ao Wi-Fi...");
  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("Wi-Fi conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("Falha ao conectar Wi-Fi.");
  }
}

// ===== FUNÇÃO: Conectar ao MQTT =====
void conectarMQTT() {
  Serial.print("Conectando ao broker MQTT...");
  if (client.connect(mqtt_client_id)) {
    Serial.println("Conectado!");
  } else {
    Serial.print("Falha, código: ");
    Serial.println(client.state());
  }
}

// ===== FUNÇÃO: Publicar Telemetria (JSON) =====
void publicarTelemetria(bool detectado) {
  if (!client.connected()) {
    Serial.println("MQTT não conectado, não foi possível publicar.");
    return;
  }

  // Monta a mensagem JSON manualmente
  String mensagem = "{";
  mensagem += "\"deviceId\":\"esp32-alarme-01\",";
  mensagem += "\"sensorPIR\":";
  mensagem += detectado ? "true" : "false";
  mensagem += ",\"timestamp\":";
  mensagem += millis();  // por enquanto usamos millis() como timestamp simples
  mensagem += "}";

  client.publish(topico_telemetria, mensagem.c_str());
  
  Serial.print("Mensagem publicada: ");
  Serial.println(mensagem);
}