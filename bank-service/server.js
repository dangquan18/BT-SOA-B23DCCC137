// Ngân hàng giả lập - cổng 4002
const http = require('http');

const PORT = Number(process.env.PORT || 4002);
const DELAY_MS = Number(process.env.DELAY_MS || 0);
const FAIL_RATE = Number(process.env.FAIL_RATE || 0);
const DROP_RATE = Number(process.env.DROP_RATE || 0);
const LIMIT = 20_000_000;

const stats = { connections: 0, requests: 0, charges: 0, duplicates: 0 };
const byKey = new Map(); // Idempotency-Key -> giao dịch đã trừ
const byRef = new Map(); // reference -> số lần trừ tiền
let seq = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/stats') return send(res, 200, stats);
  if (req.method !== 'POST' || req.url !== '/charges') return send(res, 404, { error: 'not found' });

  stats.requests++;
  let raw = '';
  for await (const c of req) raw += c;
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid json' }); }
  const { reference, amount } = body || {};
  if (!reference || !Number.isInteger(amount) || amount <= 0) return send(res, 400, { error: 'invalid amount' });

  if (DELAY_MS) await sleep(DELAY_MS);

  const key = req.headers['idempotency-key'];
  if (key && byKey.has(key)) return send(res, 201, byKey.get(key)); // trả lại giao dịch cũ

  if (amount > LIMIT) return send(res, 402, { error: 'limit exceeded' });
  if (Math.random() < FAIL_RATE) return send(res, 500, { error: 'temporary failure' });

  // trừ tiền
  const n = (byRef.get(reference) || 0) + 1;
  byRef.set(reference, n);
  if (n > 1) stats.duplicates++;
  stats.charges++;
  const tx = { chargeId: 'C' + ++seq, reference, amount };
  if (key) byKey.set(key, tx);

  if (Math.random() < DROP_RATE) return req.socket.destroy(); // trừ xong rồi cắt kết nối
  send(res, 201, tx);
});

server.on('connection', (s) => {
  stats.connections++;
  console.log(`[bank] new TCP connection #${stats.connections} from port ${s.remotePort}`);
});
server.keepAliveTimeout = 5000;

server.listen(PORT, () =>
  console.log(`[bank] :${PORT} DELAY_MS=${DELAY_MS} FAIL_RATE=${FAIL_RATE} DROP_RATE=${DROP_RATE}`));
