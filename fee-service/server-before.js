// Fee Service (bản TRƯỚC KHI SỬA) - chỉ dùng để đo số liệu so sánh
// - mỗi lời gọi mở một kết nối TCP mới (agent: false)
// - không có timeout, không thử lại, không Idempotency-Key
// - mọi lỗi kết nối đều trả 500
const express = require('express');
const http = require('http');

const PORT = Number(process.env.PORT || 4001);
const BANK_URL = process.env.BANK_URL || 'http://localhost:4002';
const debts = { 1: 50_000_000, 2: 0, 3: 3_200_000 };
let seq = 0;

function callBank(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(new URL('/charges', BANK_URL), {
      method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { let b = {}; try { b = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, body: b }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

const app = express();
app.use(express.json());
app.get('/students/:id/fees', (req, res) => res.json({ studentId: Number(req.params.id), debt: debts[req.params.id] }));
app.post('/students/:id/payments', async (req, res) => {
  const id = req.params.id, amount = req.body.amount;
  if (amount > debts[id]) return res.status(400).json({ error: 'Amount exceeds debt' });
  const paymentId = 'P' + ++seq;
  try {
    const r = await callBank({ reference: paymentId, amount });
    if (r.status === 201) { debts[id] -= amount; return res.status(201).json({ paymentId, status: 'PAID' }); }
    res.status(r.status).json({ error: r.body.error, paymentId, status: 'FAILED' });
  } catch (e) {
    res.status(500).json({ error: e.message, paymentId, status: 'FAILED' });
  }
});
app.listen(PORT, () => console.log(`[fee-naive] :${PORT}`));
