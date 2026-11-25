#include <WiFi.h>
#include <PubSubClient.h>

// ===== CONFIGURAÇÕES DE REDE =====
const char* ssid = "JoseSouza";       
const char* password = "souza@5870";

// ===== CONFIGURAÇÕES MQTT =====
const char* mqtt_server = "192.168.2.168";  // IP do seu PC (onde tá o Mosquitto)
const int mqtt_port = 1883;
const char* mqtt_client_id = "esp32-alarme-01";  // ID único do seu dispositivo

// ===== OBJETOS =====
WiFiClient espClient;
PubSubClient client(espClient);

// ===== VARIÁVEIS DE CONTROLE =====
unsigned long ultimaTentativaReconexaoWifi = 0;
const long intervaloReconexaoWifi = 5000;

unsigned long ultimaTentativaReconexaoMqtt = 0;
const long intervaloReconexaoMqtt = 5000;

void setup() {
  Serial.begin(115200);
  delay(1000);

  conectarWiFi();

  client.setServer(mqtt_server, mqtt_port);
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

  // Verifica MQTT (só tenta se o Wi-Fi estiver ok)
  if (WiFi.status() == WL_CONNECTED && !client.connected()) {
    unsigned long agora = millis();
    if (agora - ultimaTentativaReconexaoMqtt >= intervaloReconexaoMqtt) {
      ultimaTentativaReconexaoMqtt = agora;
      conectarMQTT();
    }
  }

  client.loop(); // mantém a conexão MQTT viva
}

// ===== FUNÇÃO: Conectar ao Wi-Fi =====
void conectarWiFi() {
  Serial.println("Conectando ao Wi-Fi...");
  Serial.print("Rede: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("Wi-Fi conectado com sucesso!");
    Serial.print("Endereço IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("Falha ao conectar. Vai tentar novamente...");
  }
}

// ===== FUNÇÃO: Conectar ao MQTT =====
void conectarMQTT() {
  Serial.print("Conectando ao broker MQTT...");
  Serial.println(mqtt_server);

  if (client.connect(mqtt_client_id)) {
    Serial.println("Conectado ao MQTT com sucesso!");
  } else {
    Serial.print("Falha na conexão MQTT, código: ");
    Serial.println(client.state());
  }
}