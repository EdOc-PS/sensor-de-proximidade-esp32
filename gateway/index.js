const mqtt = require('mqtt');
const { createClient } = require('redis');

// ===== CONFIGURAÇÕES =====
const BROKER_URL = 'mqtt://192.168.2.168:1883';
const REDIS_URL = 'redis://localhost:6379';
const TOPICO_TELEMETRIA = 'alarme/sensor/pir';
const TOPICO_COMANDO = 'alarme/comando/sistema';
const LIMITE_HISTORICO = 100;

// ===== REDIS =====
const redis = createClient({ url: REDIS_URL });
redis.on('error', (err) => console.log('Erro Redis:', err.message));

function chave(deviceId, tipo) {
  return `device:${deviceId}:${tipo}`;
}

// ===== INÍCIO =====
async function iniciar() {
  await redis.connect();
  console.log('Gateway conectado ao Redis.');

  const client = mqtt.connect(BROKER_URL, { clientId: 'gateway-alarme-01' });

  client.on('connect', () => {
    console.log('Gateway conectado ao broker MQTT.');
    client.subscribe([TOPICO_TELEMETRIA, TOPICO_COMANDO], (err) => {
      if (!err) console.log('Assinatura realizada nos tópicos definidos.');
    });
  });

  client.on('error', (err) => console.log('Erro MQTT:', err.message));

  client.on('message', async (topico, payload) => {
    const mensagemBruta = payload.toString();

    if (topico === TOPICO_TELEMETRIA) {
      await processarTelemetria(mensagemBruta);
    } else if (topico === TOPICO_COMANDO) {
      console.log(`[COMANDO] ${mensagemBruta}`);
    }
  });
}

// ===== PROCESSAMENTO =====
async function processarTelemetria(mensagemBruta) {
  let dados;

  try {
    dados = JSON.parse(mensagemBruta);
  } catch (erro) {
    console.log(`[INVÁLIDA] motivo=JSON malformado payload=${mensagemBruta}`);
    return;
  }

  const erros = validarCampos(dados);
  if (erros.length > 0) {
    console.log(`[INVÁLIDA] motivo=${erros.join('; ')} payload=${mensagemBruta}`);
    return;
  }

  console.log(
    `[VÁLIDA] dispositivo=${dados.deviceId} ` +
    `sensorPIR=${dados.sensorPIR} timestamp=${dados.timestamp}`
  );

  try {
    await persistir(dados);
  } catch (erro) {
    console.log('Falha ao gravar no Redis:', erro.message);
  }
}

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

// ===== PERSISTÊNCIA =====
async function persistir(dados) {
  const agora = new Date().toISOString();
  const registro = JSON.stringify({ ...dados, receivedAt: agora });

  await redis.set(chave(dados.deviceId, 'state'), registro);
  await redis.lPush(chave(dados.deviceId, 'history'), registro);
  await redis.lTrim(chave(dados.deviceId, 'history'), 0, LIMITE_HISTORICO - 1);
  await redis.set(chave(dados.deviceId, 'lastSeen'), agora);

  console.log(`[REDIS] dados de ${dados.deviceId} gravados.`);
}

iniciar();