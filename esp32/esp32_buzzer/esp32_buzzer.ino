#include <WiFi.h>
#include <PubSubClient.h>
#include "secrets.h"

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

const char* mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char* mqtt_client_id = "esp32-alarme-01";
const char* topico_telemetria = "alarme/sensor/pir";
const char* topico_comando_sistema = "alarme/comando/sistema";
const char* topico_status_sistema = "alarme/status/sistema";

const int pinoPIR = 13;
const int pinoLedVerde = 12;
const int pinoLedVermelho = 14;
const int pinoBuzzer = 27;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long ultimaTentativaReconexaoWifi = 0;
const long intervaloReconexaoWifi = 5000;

unsigned long ultimaTentativaReconexaoMqtt = 0;
const long intervaloReconexaoMqtt = 5000;

int estadoAnteriorPIR = LOW;
bool sistemaAtivo = false;  // armado = true
bool bootAnunciado = false; // avisa "desarmado" uma vez ao ligar

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(pinoPIR, INPUT);
  pinMode(pinoLedVermelho, OUTPUT);
  pinMode(pinoLedVerde, OUTPUT);
  pinMode(pinoBuzzer, OUTPUT);

  digitalWrite(pinoLedVerde, LOW);
  digitalWrite(pinoLedVermelho, LOW);
  digitalWrite(pinoBuzzer, LOW);

  conectarWiFi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callbackMQTT);

  Serial.println("Calibrando sensor PIR (30 segundos)...");
  delay(30000);

  // Pisca os LEDs: pronto para armar
  digitalWrite(pinoLedVerde, HIGH);
  digitalWrite(pinoLedVermelho, HIGH);
  delay(1000);
  digitalWrite(pinoLedVerde, LOW);
  digitalWrite(pinoLedVermelho, LOW);

  Serial.println("Aguardando comando ON...");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long agora = millis();
    if (agora - ultimaTentativaReconexaoWifi >= intervaloReconexaoWifi) {
      ultimaTentativaReconexaoWifi = agora;
      Serial.println("Wi-Fi caiu! Tentando reconectar...");
      conectarWiFi();
    }
  }

  if (WiFi.status() == WL_CONNECTED && !client.connected()) {
    unsigned long agora = millis();
    if (agora - ultimaTentativaReconexaoMqtt >= intervaloReconexaoMqtt) {
      ultimaTentativaReconexaoMqtt = agora;
      conectarMQTT();
    }
  }

  client.loop();

  // Só monitora o PIR com o sistema armado
  if (sistemaAtivo) {
    int leituraPIR = digitalRead(pinoPIR);

    if (leituraPIR != estadoAnteriorPIR) {
      estadoAnteriorPIR = leituraPIR;

      if (leituraPIR == HIGH) {
        digitalWrite(pinoLedVermelho, HIGH);
        digitalWrite(pinoLedVerde, LOW);
        digitalWrite(pinoBuzzer, HIGH);
        Serial.println("Movimento detectado! LED vermelho e buzzer ligados.");
        publicarTelemetria(true);
      } else {
        digitalWrite(pinoLedVermelho, LOW);
        digitalWrite(pinoLedVerde, HIGH);
        digitalWrite(pinoBuzzer, LOW);
        Serial.println("Movimento cessou. LED verde ligado, buzzer desligado.");
        publicarTelemetria(false);
      }
    }
  }

  delay(100);
}

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

void conectarMQTT() {
  Serial.print("Conectando ao broker MQTT...");
  bool ok = (strlen(MQTT_USER) > 0)
              ? client.connect(mqtt_client_id, MQTT_USER, MQTT_PASS)
              : client.connect(mqtt_client_id);
  if (ok) {
    Serial.println("Conectado!");
    client.subscribe(topico_comando_sistema);
    Serial.print("Assinado no tópico: ");
    Serial.println(topico_comando_sistema);

    // Ao ligar, avisa que está desarmado (corrige o estado antigo no Redis)
    if (!bootAnunciado) {
      publicarConfirmacao("boot");
      bootAnunciado = true;
    }
  } else {
    Serial.print("Falha, código: ");
    Serial.println(client.state());
  }
}

void callbackMQTT(char* topico, byte* payload, unsigned int tamanho) {
  String mensagem = "";
  for (unsigned int i = 0; i < tamanho; i++) {
    mensagem += (char)payload[i];
  }

  Serial.print("Mensagem recebida no tópico ");
  Serial.print(topico);
  Serial.print(": ");
  Serial.println(mensagem);

  if (String(topico) == topico_comando_sistema) {
    // Aceita JSON ({"requestId":"...","command":"ON"}) ou texto puro ON/OFF
    String requestId = "";
    String comando = mensagem;

    int r = mensagem.indexOf("\"requestId\":\"");
    if (r >= 0) {
      r += 13;
      requestId = mensagem.substring(r, mensagem.indexOf("\"", r));
    }
    int c = mensagem.indexOf("\"command\":\"");
    if (c >= 0) {
      c += 11;
      comando = mensagem.substring(c, mensagem.indexOf("\"", c));
    }

    if (comando == "ON") {
      sistemaAtivo = true;
      estadoAnteriorPIR = LOW;
      digitalWrite(pinoLedVerde, HIGH);
      digitalWrite(pinoLedVermelho, LOW);
      digitalWrite(pinoBuzzer, LOW);
      Serial.println("Sistema ATIVADO. Monitoramento iniciado.");
    } else if (comando == "OFF") {
      sistemaAtivo = false;
      digitalWrite(pinoLedVerde, LOW);
      digitalWrite(pinoLedVermelho, LOW);
      digitalWrite(pinoBuzzer, LOW);
      Serial.println("Sistema DESATIVADO. Aguardando comando ON...");
    } else {
      Serial.println("Comando desconhecido, ignorado (sem confirmação).");
      return;
    }

    // Confirma só depois de executar
    publicarConfirmacao(requestId);
  }
}

void publicarConfirmacao(String requestId) {
  if (!client.connected()) {
    Serial.println("MQTT não conectado, não foi possível confirmar.");
    return;
  }

  String mensagem = "{";
  mensagem += "\"deviceId\":\"esp32-alarme-01\",";
  mensagem += "\"requestId\":\"" + requestId + "\",";
  mensagem += "\"sistemaAtivo\":";
  mensagem += sistemaAtivo ? "true" : "false";
  mensagem += ",\"timestamp\":";
  mensagem += millis();
  mensagem += "}";

  client.publish(topico_status_sistema, mensagem.c_str());

  Serial.print("Confirmação enviada: ");
  Serial.println(mensagem);
}

void publicarTelemetria(bool detectado) {
  if (!client.connected()) {
    Serial.println("MQTT não conectado, não foi possível publicar.");
    return;
  }

  String mensagem = "{";
  mensagem += "\"deviceId\":\"esp32-alarme-01\",";
  mensagem += "\"sensorPIR\":";
  mensagem += detectado ? "true" : "false";
  mensagem += ",\"timestamp\":";
  mensagem += millis();
  mensagem += "}";

  client.publish(topico_telemetria, mensagem.c_str());
  
  Serial.print("Mensagem publicada: ");
  Serial.println(mensagem);
}