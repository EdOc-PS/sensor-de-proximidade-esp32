const mqtt = require('mqtt');

// ===== CONFIGURAÇÕES =====
const BROKER_URL = 'mqtt://192.168.2.168:1883';
const TOPICO_TELEMETRIA = 'alarme/sensor/pir';
const TOPICO_COMANDO = 'alarme/comando/sistema';

// ===== CONEXÃO COM O BROKER =====
const client = mqtt.connect(BROKER_URL, {
  clientId: 'gateway-alarme-01'
});

client.on('connect', () => {
  console.log('Gateway conectado ao broker MQTT.');

  client.subscribe([TOPICO_TELEMETRIA, TOPICO_COMANDO], (err) => {
    if (!err) {
      console.log('Assinatura realizada nos tópicos definidos.');
    } else {
      console.log('Erro ao assinar tópicos:', err);
    }
  });
});

client.on('error', (err) => {
  console.log('Erro de conexão MQTT:', err);
});

// ===== RECEBIMENTO DE MENSAGENS =====
client.on('message', (topico, payload) => {
  const mensagemBruta = payload.toString();

  if (topico === TOPICO_TELEMETRIA) {
    processarTelemetria(mensagemBruta);
  } else if (topico === TOPICO_COMANDO) {
    console.log(`[COMANDO] ${mensagemBruta}`);
  }
});

// ===== PROCESSAMENTO DA TELEMETRIA =====
function processarTelemetria(mensagemBruta) {
  let dados;

  // Tenta interpretar o JSON
  try {
    dados = JSON.parse(mensagemBruta);
  } catch (erro) {
    registrarInvalida(mensagemBruta, 'JSON malformado');
    return;
  }

  // Valida os campos esperados
  const erros = validarCampos(dados);
  if (erros.length > 0) {
    registrarInvalida(mensagemBruta, erros.join('; '));
    return;
  }

  registrarValida(dados);
}

// ===== VALIDAÇÃO DOS CAMPOS =====
function validarCampos(dados) {
  const erros = [];

  if (typeof dados.deviceId !== 'string' || dados.deviceId.length === 0) {
    erros.push('campo deviceId ausente ou inválido');
  }
  if (typeof dados.sensorPIR !== 'boolean') {
    erros.push('campo sensorPIR ausente ou não booleano');
  }
  if (typeof dados.timestamp !== 'number') {
    erros.push('campo timestamp ausente ou não numérico');
  }

  return erros;
}

// ===== REGISTROS (LOGS) =====
function registrarValida(dados) {
  console.log(
    `[VÁLIDA] dispositivo=${dados.deviceId} ` +
    `sensorPIR=${dados.sensorPIR} timestamp=${dados.timestamp}`
  );
}

function registrarInvalida(mensagemBruta, motivo) {
  console.log(`[INVÁLIDA] motivo=${motivo} payload=${mensagemBruta}`);
}