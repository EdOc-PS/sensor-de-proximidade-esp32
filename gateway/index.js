const path = require('path');

// Lê o .env, se existir
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) {}

const mqtt = require('mqtt');
const { createClient } = require('redis');

const BROKER_URL = process.env.BROKER_URL || 'mqtt://localhost:1883';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const TOPICO_TELEMETRIA = 'alarme/sensor/pir';
const TOPICO_COMANDO = 'alarme/comando/sistema';
const TOPICO_STATUS = 'alarme/status/sistema';
const LIMITE_HISTORICO = 100;

const redis = createClient({ url: REDIS_URL });
redis.on('error', (err) => console.log('Erro Redis:', err.message));

function chave(deviceId, tipo) {
  return `device:${deviceId}:${tipo}`;
}

async function iniciar() {
  await redis.connect();
  console.log('Gateway conectado ao Redis.');

  const opcoes = { clientId: 'gateway-alarme-01' };
  if (MQTT_USER) {
    opcoes.username = MQTT_USER;
    opcoes.password = MQTT_PASS;
  }
  const client = mqtt.connect(BROKER_URL, opcoes);

  client.on('connect', () => {
    console.log('Gateway conectado ao broker MQTT.');
    client.subscribe([TOPICO_TELEMETRIA, TOPICO_COMANDO, TOPICO_STATUS], (err) => {
      if (!err) console.log('Assinatura realizada nos tópicos definidos.');
    });
  });

  client.on('reconnect', () => console.log('Reconectando ao broker MQTT...'));
  client.on('offline', () => console.log('Broker MQTT indisponível (offline).'));
  client.on('error', (err) => console.log('Erro MQTT:', err.message));

  client.on('message', async (topico, payload) => {
    const mensagemBruta = payload.toString();

    if (topico === TOPICO_TELEMETRIA) {
      await processarTelemetria(mensagemBruta);
    } else if (topico === TOPICO_COMANDO) {
      console.log(`[COMANDO] ${mensagemBruta}`);
    } else if (topico === TOPICO_STATUS) {
      await processarConfirmacao(mensagemBruta);
    }
  });
}

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
  if (dados === null || typeof dados !== 'object') {
    return ['payload não é um objeto JSON'];
  }
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

async function processarConfirmacao(mensagemBruta) {
  let d;

  try {
    d = JSON.parse(mensagemBruta);
  } catch (erro) {
    console.log(`[CONFIRMAÇÃO INVÁLIDA] motivo=JSON malformado payload=${mensagemBruta}`);
    return;
  }

  if (
    d === null || typeof d !== 'object' ||
    typeof d.deviceId !== 'string' ||
    typeof d.requestId !== 'string' ||
    typeof d.sistemaAtivo !== 'boolean'
  ) {
    console.log(`[CONFIRMAÇÃO INVÁLIDA] campos ausentes ou com tipo errado payload=${mensagemBruta}`);
    return;
  }

  try {
    const k = chave(d.deviceId, 'actuator');
    const atual = await redis.get(k);

    // O ESP32 sempre liga desarmado
    if (d.requestId === 'boot') {
      const agoraBoot = new Date().toISOString();
      const anterior = atual ? JSON.parse(atual) : {};
      await redis.set(k, JSON.stringify({
        ...anterior,
        desired: 'OFF',
        confirmed: 'OFF',
        status: 'confirmed',
        requestId: 'boot',
        confirmedAt: agoraBoot
      }));
      console.log(`[BOOT] ${d.deviceId} reiniciou: estado do atuador ajustado para OFF.`);
      return;
    }

    if (!atual) {
      console.log(`[CONFIRMAÇÃO] ${d.deviceId}: nenhum comando registrado, ignorada.`);
      return;
    }

    const estado = JSON.parse(atual);

    if (estado.requestId !== d.requestId) {
      console.log(
        `[CONFIRMAÇÃO] requestId ${d.requestId} não corresponde ao pendente (${estado.requestId}), ignorada.`
      );
      return;
    }

    const agora = new Date().toISOString();
    estado.confirmed = d.sistemaAtivo ? 'ON' : 'OFF';
    estado.status = 'confirmed';
    estado.confirmedAt = agora;

    await redis.set(k, JSON.stringify(estado));
    await redis.set(chave(d.deviceId, 'lastSeen'), agora);

    console.log(`[CONFIRMADO] ${d.deviceId} requestId=${d.requestId} estado=${estado.confirmed}`);
  } catch (erro) {
    console.log('Falha ao atualizar o atuador no Redis:', erro.message);
  }
}

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