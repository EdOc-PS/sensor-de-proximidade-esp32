const { createClient } = require('redis');

const deviceId = process.argv[2] || 'esp32-alarme-01';

function formatarHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

function formatarRegistro(json) {
  const r = JSON.parse(json);
  return `${formatarHora(r.receivedAt)} | PIR=${r.sensorPIR} | uptime=${r.timestamp}ms`;
}

async function main() {
  const redis = createClient({ url: 'redis://localhost:6379' });
  await redis.connect();

  const estado = await redis.get(`device:${deviceId}:state`);
  const lastSeen = await redis.get(`device:${deviceId}:lastSeen`);
  const historico = await redis.lRange(`device:${deviceId}:history`, 0, 9);
  const atuador = await redis.get(`device:${deviceId}:actuator`);

  console.log('=== ESTADO ATUAL ===');
  console.log(estado ? formatarRegistro(estado) : 'sem dados');

  console.log('\n=== ÚLTIMO CONTATO ===');
  console.log(lastSeen ? formatarHora(lastSeen) : 'sem dados');

  console.log('\n=== ATUADOR (SISTEMA DE ALARME) ===');
  if (atuador) {
    const a = JSON.parse(atuador);
    console.log(`desejado=${a.desired} | confirmado=${a.confirmed} | status=${a.status}`);
    console.log(`requestId: ${a.requestId}`);
    console.log(`enviado em: ${formatarHora(a.sentAt)}`);
    console.log(`confirmado em: ${a.confirmedAt ? formatarHora(a.confirmedAt) : '-'}`);
  } else {
    console.log('sem dados');
  }

  console.log('\n=== HISTÓRICO (10 mais recentes) ===');
  historico.forEach((item, i) => console.log(`${i + 1}. ${formatarRegistro(item)}`));

  await redis.quit();
}

main();