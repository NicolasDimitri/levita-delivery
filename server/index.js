// server/index.js
// Servidor Express local que replica o comportamento das funções serverless
// do Vercel (/api/ifood/*). Em produção o Vercel usa os arquivos em /api
// diretamente — este arquivo só existe pra rodar com Docker localmente.
//
// Cada rota aqui chama o mesmo handler exportado pelo arquivo original,
// então não há duplicação de lógica — é um "adaptador" só.

import express from 'express';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

// importa cada handler
import webhookHandler from '../api/ifood/webhook.js';
import confirmHandler from '../api/ifood/confirm.js';
import dispatchHandler from '../api/ifood/dispatch.js';
import verifyDeliveryHandler from '../api/ifood/verify-delivery.js';
import orderMetaHandler from '../api/ifood/order-meta.js';
import storeHoursStatusHandler from '../api/ifood/store-hours-status.js';
import toggleStoreHoursHandler from '../api/ifood/toggle-store-hours.js';
import cleanupHandler from '../api/ifood/cleanup-webhook-events.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Precisamos do body RAW (sem parse) APENAS pra validar a assinatura HMAC do webhook
// pra todos os outros endpoints queremos o body já parseado como JSON
app.use((req, res, next) => {
  if (req.path === '/api/ifood/webhook') {
    let chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8'));
      } catch {
        req.body = {};
      }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// Adapta o req/res do Express pro formato esperado pelos handlers do Vercel
// (a interface é quase idêntica, só o rawBody precisa de tratamento especial
// pro webhook, que já resolvemos acima)
function adapt(handler) {
  return (req, res) => handler(req, res);
}

// rotas
app.post('/api/ifood/webhook', adapt(webhookHandler));
app.post('/api/ifood/confirm', adapt(confirmHandler));
app.post('/api/ifood/dispatch', adapt(dispatchHandler));
app.post('/api/ifood/verify-delivery', adapt(verifyDeliveryHandler));
app.get('/api/ifood/order-meta', adapt(orderMetaHandler));
app.get('/api/ifood/store-hours-status', adapt(storeHoursStatusHandler));
app.post('/api/ifood/toggle-store-hours', adapt(toggleStoreHoursHandler));
app.post('/api/ifood/cleanup-webhook-events', adapt(cleanupHandler));

app.listen(PORT, () => {
  console.log(`API local rodando em http://localhost:${PORT}`);
  console.log('Endpoints disponíveis:');
  console.log(`  POST /api/ifood/webhook`);
  console.log(`  POST /api/ifood/confirm`);
  console.log(`  POST /api/ifood/dispatch`);
  console.log(`  POST /api/ifood/verify-delivery`);
  console.log(`  GET  /api/ifood/order-meta`);
  console.log(`  GET  /api/ifood/store-hours-status`);
  console.log(`  POST /api/ifood/toggle-store-hours`);
});
