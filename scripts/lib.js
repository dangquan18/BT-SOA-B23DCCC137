const FEE = process.env.FEE_URL || 'http://localhost:4001';
const BANK = process.env.BANK_URL || 'http://localhost:4002';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pay(id, amount, timeoutMs = 15000) {
  const t = Date.now();
  try {
    const r = await fetch(`${FEE}/students/${id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }), signal: AbortSignal.timeout(timeoutMs),
    });
    return { code: r.status, body: await r.json(), ms: Date.now() - t };
  } catch (e) { return { code: 0, body: { error: e.message }, ms: Date.now() - t }; }
}

async function fees(id = 1) {
  const t = Date.now();
  try {
    const r = await fetch(`${FEE}/students/${id}/fees`);
    return { code: r.status, body: await r.json(), ms: Date.now() - t };
  } catch (e) { return { code: 0, body: {}, ms: Date.now() - t }; }
}

const stats = async () => (await fetch(BANK + '/stats')).json();

function tally(results) {
  const t = {};
  for (const r of results) { const k = `${r.code} ${r.body.status || ''}`.trim(); t[k] = (t[k] || 0) + 1; }
  return t;
}

module.exports = { FEE, BANK, sleep, pay, fees, stats, tally };
