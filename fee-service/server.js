// Fee Service (bản ĐÃ SỬA) - cổng 4001
const express = require('express');
const { PORT, BANK_URL } = require('./config');
const store = require('./store');
const { charge } = require('./bankClient');

const app = express();
app.use(express.json());

app.get('/students/:id/fees', (req, res) => {
  const id = req.params.id;
  if (!store.hasStudent(id)) return res.status(404).json({ error: 'Student not found' });
  res.json({ studentId: Number(id), debt: store.debts[id] });
});

app.post('/students/:id/payments', async (req, res) => {
  const id = req.params.id;
  const fail = (code, error) => res.status(code).json({ error, paymentId: null, status: 'FAILED' });
  if (!store.hasStudent(id)) return fail(404, 'Student not found');
  const amount = req.body && req.body.amount;
  if (!Number.isInteger(amount) || amount <= 0) return fail(400, 'Invalid amount');
  // Trừ cả tiền đang giữ chỗ, để 2 lệnh song song không vượt công nợ
  if (amount > store.available(id)) return fail(400, 'Amount exceeds debt');

  store.reserved[id] += amount;
  const paymentId = store.nextPaymentId();
  const p = { paymentId, studentId: Number(id), amount, status: 'PENDING' };
  store.payments.set(paymentId, p);

  const r = await charge(paymentId, amount);
  p.status = r.ok ? 'PAID' : r.status;
  if (r.status !== 'PENDING') store.reserved[id] -= amount; // PENDING: giữ chỗ đến khi đối soát
  if (r.ok) {
    store.debts[id] -= amount; // công nợ chỉ giảm khi ngân hàng đã trừ tiền
    p.chargeId = r.chargeId;
    return res.status(201).json({ paymentId, status: 'PAID', chargeId: r.chargeId, amount, debt: store.debts[id] });
  }
  res.status(r.http).json({ error: r.error, paymentId, status: r.status });
});

app.get('/payments/:pid', (req, res) => {
  const p = store.payments.get(req.params.pid);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  res.json(p);
});

// JSON hỏng / lỗi bất ngờ -> vẫn trả JSON
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, paymentId: null, status: 'FAILED' }));
process.on('uncaughtException', (e) => console.error('[fee] uncaught', e));

app.listen(PORT, () => console.log(`[fee] :${PORT} BANK_URL=${BANK_URL}`));
