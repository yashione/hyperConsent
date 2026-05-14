const cors = require('cors');
const express = require('express');
const { randomUUID } = require('crypto');
const gateway = require('./contract');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: gateway.mode });
});

app.post('/consents', async (req, res, next) => {
  try {
    const id = req.body.id || randomUUID();
    const consent = await gateway.createConsent(
      id,
      req.body.user_id,
      req.body.consumer_id,
      req.body.purpose,
      req.body.status
    );
    res.status(201).json(consent);
  } catch (error) {
    next(error);
  }
});

app.get('/consents/:id', async (req, res, next) => {
  try {
    res.json(await gateway.getConsent(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get('/consents/:id/history', async (req, res, next) => {
  try {
    res.json(await gateway.getConsentHistory(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get('/consents', async (req, res, next) => {
  try {
    res.json(await gateway.listConsents(req.query));
  } catch (error) {
    next(error);
  }
});

app.put('/consents/:id/revoke', async (req, res, next) => {
  try {
    res.json(await gateway.revokeConsent(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.put('/consents/:id/grant', async (req, res, next) => {
  try {
    res.json(await gateway.grantConsent(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error.message || 'Gateway error';
  const status = message.includes('not found') ? 404 : 400;
  res.status(status).json({ detail: message });
});

app.listen(port, () => {
  console.log(`Consent Fabric Gateway listening on ${port} (${gateway.mode})`);
});
