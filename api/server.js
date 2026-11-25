const path = require('path');
const crypto = require('crypto');

// Lê o .env, se existir
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) {}

const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const { createClient } = require('redis');

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BROKER_URL = process.env.BROKER_URL || 'mqtt://localhost:1883';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const API_KEY = process.env.API_KEY;
const LIMITE_PRESENCA_SEGUNDOS = Number(process.env.LIMITE_PRESENCA_SEGUNDOS || 60);
const TOPICO_COMANDO = 'alarme/comando/sistema';
const MAX_HISTORICO = 100;

// Sem API_KEY a API não sobe
if (!API_KEY || API_KEY.length < 8) {
  console.error('ERRO: API_KEY ausente ou muito curta (mínimo 8 caracteres). Configure o arquivo .env.');
  process.exit(1);
}

const redis = createClient({ url: REDIS_URL, disableOfflineQueue: true });
redis.on('error', (err) => console.log('Erro Redis:', err.message));
redis.connect().catch(() => {});

const opcoesMqtt = { clientId: 'api-alarme-01' };
if (MQTT_USER) {
  opcoesMqtt.username = MQTT_USER;
  opcoesMqtt.password = MQTT_PASS;
}
const mqttClient = mqtt.connect(BROKER_URL, opcoesMqtt);
mqttClient.on('connect', () => console.log('API conectada ao broker MQTT.'));
mqttClient.on('error', (err) => console.log('Erro MQTT:', err.message));

const app = express();
app.use(cors());
app.use(express.json({ limit: '1kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function chave(deviceId, tipo) {
  return `device:${deviceId}:${tipo}`;
}

// Erro de Redis vira 503
function rota(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (erro) {
      console.log('Erro:', erro.message);
      res.status(503).json({
        erro: 'REDIS_INDISPONIVEL',
        mensagem: 'Não foi possível acessar o banco de dados.',
      });
    }
  };
}

// Exige a chave X-API-Key nos comandos
function exigirChave(req, res, next) {
  const enviada = req.get('x-api-key');
  if (!enviada) {
    return res.status(401).json({ erro: 'CHAVE_AUSENTE', mensagem: 'Informe a chave de acesso no cabeçalho X-API-Key.' });
  }
  const a = Buffer.from(enviada);
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.log('Acesso negado: chave inválida em', req.originalUrl);
    return res.status(403).json({ erro: 'CHAVE_INVALIDA', mensagem: 'Chave de acesso inválida.' });
  }
  next();
}

// Confere se o dispositivo existe
const checarDispositivo = rota(async (req, res, next) => {
  const id = req.params.deviceId;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return res.status(400).json({ erro: 'DEVICE_ID_INVALIDO', mensagem: 'deviceId inválido.' });
  }
  const existentes = await redis.exists([
    chave(id, 'state'), chave(id, 'history'), chave(id, 'lastSeen'), chave(id, 'actuator'),
  ]);
  if (existentes === 0) {
    return res.status(404).json({ erro: 'DISPOSITIVO_NAO_ENCONTRADO', mensagem: `Dispositivo ${id} não encontrado.` });
  }
  next();
});

function semDados(res, id, o_que) {
  return res.status(404).json({ erro: 'SEM_DADOS', mensagem: `Dispositivo ${id} sem ${o_que} registrado.` });
}

app.get('/api/health', rota(async (req, res) => {
  await redis.ping();
  res.json({ status: 'ok', redis: 'ok', mqtt: mqttClient.connected ? 'ok' : 'offline' });
}));

app.get('/api/devices/:deviceId/state', checarDispositivo, rota(async (req, res) => {
  const id = req.params.deviceId;
  const json = await redis.get(chave(id, 'state'));
  if (!json) return semDados(res, id, 'estado');
  res.json({ deviceId: id, state: JSON.parse(json) });
}));

app.get('/api/devices/:deviceId/history', checarDispositivo, rota(async (req, res) => {
  const id = req.params.deviceId;
  const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORICO) {
    return res.status(400).json({ erro: 'LIMIT_INVALIDO', mensagem: `limit deve ser um inteiro entre 1 e ${MAX_HISTORICO}.` });
  }
  const itens = await redis.lRange(chave(id, 'history'), 0, limit - 1);
  if (itens.length === 0) return semDados(res, id, 'histórico');
  const total = await redis.lLen(chave(id, 'history'));
  res.json({ deviceId: id, total, count: itens.length, history: itens.map((i) => JSON.parse(i)) });
}));

app.get('/api/devices/:deviceId/presence', checarDispositivo, rota(async (req, res) => {
  const id = req.params.deviceId;
  const lastSeen = await redis.get(chave(id, 'lastSeen'));
  if (!lastSeen) return semDados(res, id, 'último contato');
  const segundos = Math.round((Date.now() - new Date(lastSeen).getTime()) / 1000);
  res.json({
    deviceId: id,
    lastSeen,
    secondsSinceLastSeen: segundos,
    online: segundos <= LIMITE_PRESENCA_SEGUNDOS,
    limitSeconds: LIMITE_PRESENCA_SEGUNDOS,
  });
}));

app.get('/api/devices/:deviceId/actuator', checarDispositivo, rota(async (req, res) => {
  const id = req.params.deviceId;
  const json = await redis.get(chave(id, 'actuator'));
  if (!json) return semDados(res, id, 'estado do atuador');
  res.json({ deviceId: id, actuator: JSON.parse(json) });
}));

app.post('/api/devices/:deviceId/command', exigirChave, checarDispositivo, rota(async (req, res) => {
  const id = req.params.deviceId;
  const comando = String((req.body && req.body.command) || '').toUpperCase();

  if (comando !== 'ON' && comando !== 'OFF') {
    return res.status(400).json({ erro: 'COMANDO_INVALIDO', mensagem: 'command deve ser "ON" ou "OFF".' });
  }
  if (!mqttClient.connected) {
    return res.status(503).json({ erro: 'MQTT_INDISPONIVEL', mensagem: 'Broker MQTT indisponível.' });
  }

  const k = chave(id, 'actuator');
  const anterior = await redis.get(k);
  const ant = anterior ? JSON.parse(anterior) : {};

  const requestId = `cmd-${Date.now()}`;
  const estado = {
    desired: comando,
    confirmed: ant.confirmed ?? null,
    status: 'pending',
    requestId,
    sentAt: new Date().toISOString(),
    confirmedAt: ant.confirmedAt ?? null,
  };

  // pending antes de publicar
  await redis.set(k, JSON.stringify(estado));

  try {
    await new Promise((ok, falha) => {
      mqttClient.publish(TOPICO_COMANDO, JSON.stringify({ requestId, command: comando }), { qos: 1 },
        (err) => (err ? falha(err) : ok()));
    });
  } catch (erro) {
    return res.status(503).json({ erro: 'MQTT_FALHA_PUBLICACAO', mensagem: 'Falha ao publicar o comando.' });
  }

  console.log(`[COMANDO] ${id} ${comando} requestId=${requestId}`);
  res.status(202).json({ deviceId: id, actuator: estado });
}));

app.use((req, res) => {
  res.status(404).json({ erro: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON_INVALIDO', mensagem: 'Corpo da requisição não é um JSON válido.' });
  }
  console.log('Erro:', err.message);
  res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno.' });
});

app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));