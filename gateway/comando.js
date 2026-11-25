const path = require('path');

// Lê o .env, se existir
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) {}

const mqtt = require('mqtt');
const { createClient } = require('redis');

const BROKER_URL = process.env.BROKER_URL || 'mqtt://localhost:1883';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const TOPICO_COMANDO = 'alarme/comando/sistema';

const comando = (process.argv[2] || '').toUpperCase();
const deviceId = process.argv[3] || 'esp32-alarme-01';

if (comando !== 'ON' && comando !== 'OFF') {
  console.log('Uso: node comando.js ON|OFF [deviceId]');
  process.exit(1);
}

async function main() {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const k = `device:${deviceId}:actuator`;
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

  // grava o pending antes de publicar
  await redis.set(k, JSON.stringify(estado));
  console.log(`[REDIS] estado=pending desired=${comando} requestId=${requestId}`);

  const opcoes = { clientId: `gateway-comando-${Date.now()}` };
  if (MQTT_USER) {
    opcoes.username = MQTT_USER;
    opcoes.password = MQTT_PASS;
  }
  const client = mqtt.connect(BROKER_URL, opcoes);

  client.on('connect', () => {
    const msg = JSON.stringify({ requestId, command: comando });
    client.publish(TOPICO_COMANDO, msg, { qos: 1 }, async () => {
      console.log(`[COMANDO ENVIADO] ${msg}`);
      client.end();
      await redis.quit();
    });
  });
  client.on('error', (e) => console.log('Erro MQTT:', e.message));
}

main();