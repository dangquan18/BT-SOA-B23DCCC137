const http = require('http');
const { BANK_URL, DEADLINE_MS, MAX_ATTEMPTS, MAX_SOCKETS, IDLE_SOCKET_MS } = require('./config');

const agent = new http.Agent({
  keepAlive: true, maxSockets: MAX_SOCKETS, maxFreeSockets: MAX_SOCKETS, timeout: IDLE_SOCKET_MS,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callBank(payload, key, remaining) {
  return new Promise((resolve, reject) => {
    const url = new URL('/charges', BANK_URL);
    const data = JSON.stringify(payload);
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };

    const req = http.request(url, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Idempotency-Key': key,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch {}
        finish(resolve, { status: res.statusCode, body });
      });
      res.on('error', () => finish(reject, { kind: 'broken' }));
      res.on('aborted', () => finish(reject, { kind: 'broken' }));
    });

    const timer = setTimeout(() => { finish(reject, { kind: 'timeout' }); req.destroy(); }, remaining);

    req.on('error', (e) => {
      if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(e.code)) finish(reject, { kind: 'refused' });
      else finish(reject, { kind: 'broken' });
    });
    req.end(data);
  });
}

async function charge(paymentId, amount) {
  const start = Date.now();
  let maybeCharged = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = DEADLINE_MS - (Date.now() - start);
    if (remaining <= 0) break;
    try {
      const r = await callBank({ reference: paymentId, amount }, paymentId, remaining);
      if (r.status === 201) return { ok: true, chargeId: r.body.chargeId };
      if (r.status >= 500) { await sleep(50 * attempt); continue; }
      return { ok: false, http: r.status, error: r.body.error || 'Bank rejected', status: 'FAILED' };
    } catch (e) {
      if (e.kind === 'refused') {
        if (maybeCharged) break;
        return { ok: false, http: 503, error: 'Bank unavailable', status: 'FAILED' };
      }
      maybeCharged = true;
      if (e.kind === 'timeout') break;
      await sleep(50 * attempt);
    }
  }
  if (maybeCharged) return { ok: false, http: 504, error: 'Bank result unknown (timeout or connection lost)', status: 'PENDING' };
  return { ok: false, http: 503, error: 'Bank temporarily unavailable', status: 'FAILED' };
}

module.exports = { charge };
