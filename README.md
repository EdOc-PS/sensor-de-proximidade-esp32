<div align="center">

<img src="https://www.ifmg.edu.br/portal/centrais-de-conteudos/publicacoes/informativo/183/183_arquivos/logo-1.png/@@images/5076e06e-d465-431a-b2cd-0b728c0227e3.png" alt="Logo IFMG" width="200"/>

# 🚨 Sensor de Alarme com Detector de Movimento (PIR)

📡 Projeto da disciplina **Internet das Coisas III** — Bacharelado em Sistemas de Informação — **IFMG Campus Ouro Branco**

👨‍💻 Estudante: Eduardo Octavio de Paula Souza
👨‍🏫 Professor: Charles Tim Batista Garrocho

</div>

---

## 📋 Sobre o projeto

Sistema de alarme inteligente com detector de movimento, construído com **ESP32**, **MQTT** e (em desenvolvimento) um **Gateway em Node.js**. O sistema detecta movimento através de um sensor PIR, sinaliza visualmente com LEDs, aciona um buzzer e pode ser ativado/desativado remotamente via comando MQTT.

### 🎯 Funcionalidades

- 📶 Conexão Wi-Fi com reconexão automática
- 📨 Comunicação MQTT bidirecional (publica telemetria e recebe comandos)
- 🟢 LED verde: sistema ativo, sem detecção
- 🔴 LED vermelho: movimento detectado
- 🔊 Buzzer: alarme sonoro ao detectar movimento
- 🎮 Ativação/desativação remota do sistema (ON/OFF via MQTT)
- 🐳 Broker MQTT (Mosquitto) rodando em Docker

---

## 🏗️ Arquitetura

```
Sensor PIR → ESP32 → Wi-Fi → Broker MQTT → Gateway (Node.js) → Redis → API/Web
                                                                  (próximas etapas)
```

- **ESP32**: lê o sensor PIR, controla os LEDs e o buzzer, publica telemetria e recebe comandos
- **Broker MQTT (Mosquitto)**: intermediário de mensagens, executado via Docker
- **Gateway (Node.js)**: 🔧 em desenvolvimento — assina os tópicos, identifica o dispositivo e valida as mensagens recebidas

---

## 🔌 Hardware utilizado

| Componente | Pino no ESP32 |
|---|---|
| Sensor PIR (HC-SR501) — OUT | GPIO 13 (D13) |
| Sensor PIR — VCC | VIN (5V) |
| LED 🟢 Verde | GPIO 12 (D12) |
| LED 🔴 Vermelho | GPIO 14 (D14) |
| Buzzer ativo | GPIO 27 (D27) |

---

## 📁 Estrutura do repositório

```
projeto-iot3/
├── esp32/              # Firmware do ESP32 (Arduino/C++)
├── gateway/            # Gateway em Node.js
│   ├── index.js
│   └── package.json
├── mosquitto/          # Broker MQTT via Docker
│   ├── docker-compose.yml
│   └── config/
│       └── mosquitto.conf
├── docs/               # Diagramas e documentação
└── README.md
```

---

## 📡 Tópicos MQTT

| Tópico | Direção | Descrição |
|---|---|---|
| `alarme/sensor/pir` | ESP32 → Broker | Telemetria do sensor (JSON) |
| `alarme/comando/sistema` | Broker → ESP32 | Comando `ON`/`OFF` para ativar/desativar o sistema |

### Exemplo de mensagem de telemetria

```json
{
  "deviceId": "esp32-alarme-01",
  "sensorPIR": true,
  "timestamp": 74428
}
```

---

## 🚀 Como executar

### 1️⃣ Subir o broker MQTT (Mosquitto)

```bash
cd mosquitto
docker-compose up -d
```

### 2️⃣ Fazer upload do firmware no ESP32

- Abrir o código da pasta `esp32/` na Arduino IDE
- Ajustar SSID, senha e IP do broker
- Fazer upload para a placa

### 3️⃣ Rodar o Gateway

```bash
cd gateway
npm install
node index.js
```

### 4️⃣ Ativar o sistema (via terminal, simulando o dashboard)

```bash
docker exec -it mosquitto-broker-iot mosquitto_pub -t "alarme/comando/sistema" -m "ON"
```

---

## ✅ Status do projeto

- [x] 🟩 Conexão Wi-Fi com reconexão automática
- [x] 🟩 Conexão e comunicação MQTT (publicação e assinatura)
- [x] 🟩 Sensor PIR publicando telemetria
- [x] 🟩 LEDs reagindo automaticamente à detecção
- [x] 🟩 Buzzer acionado via lógica local
- [x] 🟩 Comando remoto ON/OFF via MQTT
- [ ] 🟥 Gateway em Node.js processando e validando mensagens
- [ ] 🟥 Persistência em Redis (estado, histórico, presença)
- [ ] 🟥 API HTTP/JSON
- [ ] 🟥 Sistema web (dashboard de monitoramento e controle)
- [ ] 🟥 Autenticação e segurança básica

---

## 📚 Disciplina

Projeto desenvolvido como parte da disciplina **Internet das Coisas III**, cujo princípio central é a integração entre hardware, conectividade, serviços em nuvem e sistemas web, utilizando uma arquitetura tecnológica comum: **ESP32 → Wi-Fi → MQTT → Gateway (Node.js) → Redis → API/Sistema Web**.
