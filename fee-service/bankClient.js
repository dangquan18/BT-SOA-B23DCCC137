// Client gọi ngân hàng: keep-alive, timeout, retry với Idempotency-Key
const http = require('http');
const { BANK_URL, DEADLINE_MS, MAX_ATTEMPTS, MAX_SOCKETS, IDLE_SOCKET_MS } = require('./config');

// [TH3] Giữ kết nối (keep-alive), tối đa 20 socket tới ngân hàng.
// Socket nhàn rỗi quá IDLE_SOCKET_MS (3s < 5s của ngân hàng) bị client tự đóng,
// nên không bao giờ gửi vào socket mà ngân hàng vừa đóng.
const agent = new http.Agent({
  keepAlive: true, maxSockets: MAX_SOCKETS, maxFreeSockets: MAX_SOCKETS, timeout: IDLE_SOCKET_MS,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Một lần gọi ngân hàng.
// resolve {status, body} | reject {kind}: 'refused' (chắc chắn chưa gửi), 'timeout' / 'broken' (không rõ)
function callBank(payload, key, remaining) {
  return new Promise((resolve, reject) => {
    const url = new URL('/charges', BANK_URL); // [TH1] không cache kết nối hỏng, mỗi lần gọi đều thử lại
    const data = JSON.stringify(payload);
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };

    const req = http.request(url, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Idempotency-Key': key, // [TH4] gửi lại cùng khóa -> ngân hàng không trừ thêm
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

    // [TH2] Timer riêng: tính cả thời gian chờ lấy socket, không chỉ thời gian chờ dữ liệu
    const timer = setTimeout(() => { finish(reject, { kind: 'timeout' }); req.destroy(); }, remaining);

    req.on('error', (e) => {
      // [TH1] Không mở được kết nối -> chắc chắn ngân hàng chưa nhận yêu cầu
      if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(e.code)) finish(reject, { kind: 'refused' });
      else finish(reject, { kind: 'broken' }); // ECONNRESET, socket hang up... -> có thể đã trừ tiền
    });
    req.end(data);
  });
}

// Trừ tiền cho một lệnh. Idempotency-Key = paymentId nên thử lại an toàn.
// Trả về { ok: true, chargeId } | { ok: false, http, error, status: 'FAILED' | 'PENDING' }
async function charge(paymentId, amount) {
  const start = Date.now();
  let maybeCharged = false; // đã có lần gửi mà không biết kết quả
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = DEADLINE_MS - (Date.now() - start);
    if (remaining <= 0) break;
    try {
      const r = await callBank({ reference: paymentId, amount }, paymentId, remaining);
      if (r.status === 201) return { ok: true, chargeId: r.body.chargeId };
      if (r.status >= 500) { await sleep(50 * attempt); continue; } // [TH4b] lỗi tạm thời -> thử lại
      // [TH4c] 4xx là từ chối rõ ràng -> KHÔNG thử lại, giữ nguyên mã của ngân hàng
      return { ok: false, http: r.status, error: r.body.error || 'Bank rejected', status: 'FAILED' };
    } catch (e) {
      if (e.kind === 'refused') {
        if (maybeCharged) break; // lần trước có thể đã trừ -> vẫn là PENDING
        return { ok: false, http: 503, error: 'Bank unavailable', status: 'FAILED' };
      }
      maybeCharged = true;
      if (e.kind === 'timeout') break;   // [TH2] hết thời gian -> dừng, không chờ thêm
      await sleep(50 * attempt);         // [TH4a] đứt kết nối -> gửi lại cùng khóa
    }
  }
  if (maybeCharged) return { ok: false, http: 504, error: 'Bank result unknown (timeout or connection lost)', status: 'PENDING' };
  return { ok: false, http: 503, error: 'Bank temporarily unavailable', status: 'FAILED' };
}

module.exports = { charge };
