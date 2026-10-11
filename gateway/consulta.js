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

  console.log('=== ESTADO ATUAL ===');
  console.log(estado ? formatarRegistro(estado) : 'sem dados');

  console.log('\n=== ÚLTIMO CONTATO ===');
  console.log(lastSeen ? formatarHora(lastSeen) : 'sem dados');

  console.log('\n=== HISTÓRICO (10 mais recentes) ===');
  historico.forEach((item, i) => console.log(`${i + 1}. ${formatarRegistro(item)}`));

  await redis.quit();
}

main();