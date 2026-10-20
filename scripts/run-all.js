const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { FEE, BANK, sleep, pay, fees, stats } = require('./lib');

const ROOT = path.join(__dirname, '..');
const BANK_FILE = 'bank-service/server.js';
const VERSIONS = { before: 'fee-service/server-before.js', after: 'fee-service/server.js' };
const procs = [];
let FEE_FILE, rows;

function start(file, env = {}) {
  const p = spawn(process.execPath, [path.join(ROOT, file)], { env: { ...process.env, ...env }, stdio: 'ignore' });
  procs.push(p);
  return p;
}
async function stop(...ps) {
  for (const p of ps) if (p && p.exitCode === null) { p.kill(); await new Promise((r) => p.once('exit', r)); }
}
async function waitUp(url) {
  for (let i = 0; i < 100; i++) { try { await fetch(url); return; } catch { await sleep(100); } }
  throw new Error('not up ' + url);
}
async function up(bankEnv) {
  const bank = bankEnv ? start(BANK_FILE, bankEnv) : null;
  const fee = start(FEE_FILE);
  if (bank) await waitUp(BANK + '/stats');
  await waitUp(FEE + '/students/1/fees');
  return [fee, bank];
}
function ck(sc, pass, check, value) {
  rows.push({ sc, check, value, pass });
  console.log(`  ${pass ? '[ĐẠT]  ' : '[CHƯA] '} ${check}: ${value}`);
}
const s = (r) => `${r.code} ${r.body.status || ''} ${r.ms}ms`;

async function tc1() {
  console.log('\n=== TH1: ngân hàng tắt rồi chạy lại ===');
  const [fee] = await up(null);
  let r = await pay(1, 100000);
  ck('TH1', r.code === 503 && !!r.body.error && r.ms < 1500, 'Bank tắt -> 503 + error, < 1,5s', `${s(r)} ${JSON.stringify(r.body)}`);
  const f = await fees();
  ck('TH1', fee.exitCode === null && f.code === 200 && f.ms < 300, 'Fee Service sống, GET fees 200 nhanh', `${f.code} ${f.ms}ms`);
  const bank = start(BANK_FILE); await waitUp(BANK + '/stats');
  r = await pay(1, 100000);
  ck('TH1', r.code === 201, 'Bank chạy lại -> 201 không cần restart', s(r));
  await stop(fee, bank);
  const fee2 = start(FEE_FILE, { BANK_URL: 'http://localhost:4999' }); await waitUp(FEE + '/students/1/fees');
  r = await pay(1, 100000);
  ck('TH1', r.code === 503 && r.ms < 1500, 'BANK_URL=http://localhost:4999 -> vẫn 503', s(r));
  await stop(fee2);
}

async function tc2() {
  console.log('\n=== TH2: ngân hàng chậm (DELAY_MS=5000) ===');
  const [fee, bank] = await up({ DELAY_MS: '5000' });
  const r = await pay(1, 100000);
  ck('TH2', r.code === 504 && r.body.status === 'PENDING', '1 thanh toán -> 504 PENDING', s(r));
  ck('TH2', r.ms <= 4500, 'Thời gian trả lời <= 4,5s', `${r.ms}ms`);
  const t = Date.now();
  const all = Promise.all(Array.from({ length: 20 }, () => pay(1, 100000)));
  await sleep(500);
  const lat = []; for (let i = 0; i < 5; i++) { lat.push((await fees()).ms); await sleep(200); }
  ck('TH2', Math.max(...lat) < 300, 'GET fees khi 20 thanh toán đang chờ < 300ms', `${lat.join(', ')} ms`);
  const rs = await all;
  const max = Math.max(...rs.map((x) => x.ms));
  const pend = rs.filter((x) => x.code === 504 && x.body.status === 'PENDING').length;
  ck('TH2', pend === 20 && max <= 4500, '20 thanh toán đồng thời: 504 PENDING, <= 4,5s', `${pend}/20 PENDING, chậm nhất ${max}ms, tổng ${Date.now() - t}ms`);
  await stop(fee, bank);
}

async function tc3() {
  console.log('\n=== TH3: duy trì kết nối (200 thanh toán, 10 đồng thời) ===');
  const [fee, bank] = await up({});
  const t = Date.now(); let ok = 0, next = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (next++ < 200) { const r = await pay(1, 1000); if (r.code === 201) ok++; }
  }));
  const ms = Date.now() - t;
  const st = await stats();
  ck('TH3', ok === 200, '200/200 thành công', `${ok}/200 trong ${ms}ms`);
  ck('TH3', st.connections <= 20, 'Số kết nối TCP <= 20', `connections=${st.connections}`);
  console.log('  ...nhàn rỗi 6 giây');
  await sleep(6000);
  const rs = []; for (let i = 0; i < 5; i++) rs.push((await pay(1, 1000)).code);
  ck('TH3', rs.every((c) => c === 201), 'Sau 6s nhàn rỗi, 5 yêu cầu tiếp theo thành công', rs.join(','));
  await stop(fee, bank);
}

async function tc4ab(label, env) {
  console.log(`\n=== TH4${label}: ${JSON.stringify(env)}, 60 thanh toán lần lượt ===`);
  const [fee, bank] = await up(env);
  let paid = 0, maxMs = 0; const bad = {};
  for (let i = 0; i < 60; i++) {
    const r = await pay(1, 1000); maxMs = Math.max(maxMs, r.ms);
    if (r.code === 201) paid++; else { const k = `${r.code} ${r.body.status}`; bad[k] = (bad[k] || 0) + 1; }
  }
  const st = await stats(); const f = await fees();
  const badStr = Object.entries(bad).map(([k, v]) => `${v}×(${k})`).join(', ') || 'không có';
  const sc = 'TH4' + label;
  ck(sc, paid >= 54, '>= 54/60 PAID', `${paid}/60; không thành công: ${badStr}`);
  if (label === 'a') ck(sc, Object.keys(bad).every((k) => k === '504 PENDING'), 'Lệnh không thành công trả 504 PENDING', badStr);
  ck(sc, st.duplicates === 0, 'duplicates = 0', `charges=${st.charges}, requests=${st.requests}, duplicates=${st.duplicates}, connections=${st.connections}`);
  const dec = 50_000_000 - f.body.debt;
  ck(sc, dec === paid * 1000, 'Công nợ giảm đúng tiền các lệnh PAID', `giảm ${dec.toLocaleString('vi')}đ, PAID ${paid}×1.000đ`);
  ck(sc, maxMs <= 4500, 'Mỗi thanh toán <= 4,5s', `chậm nhất ${maxMs}ms`);
  await stop(fee, bank);
}

async function tc4c() {
  console.log('\n=== TH4c: thanh toán 25.000.000đ (vượt hạn mức) ===');
  const [fee, bank] = await up({});
  const r = await pay(1, 25_000_000); const st = await stats();
  ck('TH4c', r.code === 402 && r.body.status === 'FAILED', 'Trả 402 FAILED', `${s(r)} ${JSON.stringify(r.body)}`);
  ck('TH4c', st.requests === 1, 'Ngân hàng nhận đúng 1 yêu cầu', `requests=${st.requests}`);
  await stop(fee, bank);
}

async function rules() {
  console.log('\n=== Quy tắc nghiệp vụ ===');
  const [fee, bank] = await up({});
  let r = await pay(2, 100000);
  ck('NV', r.code === 400 && !!r.body.error, 'SV2 nợ 0 -> không cho thanh toán', `${r.code} ${JSON.stringify(r.body)}`);
  r = await pay(3, 3_300_000);
  ck('NV', r.code === 400, 'SV3 trả 3,3tr > nợ 3,2tr -> 400', `${r.code}`);
  const rs = await Promise.all([pay(3, 3_000_000), pay(3, 3_000_000)]);
  const f = await fees(3);
  ck('NV', f.body.debt >= 0 && rs.filter((x) => x.code === 201).length === 1, '2 lệnh 3tr song song cho SV3 -> chỉ 1 lệnh qua, nợ không âm', `${rs.map((x) => x.code).join(',')}; nợ còn ${f.body.debt}`);
  await stop(fee, bank);
}

async function runVersion(name) {
  FEE_FILE = VERSIONS[name]; rows = [];
  console.log(`\n##########  ${name.toUpperCase()}: ${FEE_FILE}  ##########`);
  await tc1(); await tc2(); await tc3();
  await tc4ab('a', { DROP_RATE: '0.3' }); await tc4ab('b', { FAIL_RATE: '0.3' }); await tc4c();
  await rules();
  fs.writeFileSync(path.join(ROOT, 'results', `${name}.json`), JSON.stringify(rows, null, 2));
  return rows;
}

function writeSummary(out) {
  const cell = (r) => (r ? `${r.pass ? '✅' : '❌'} ${r.value}`.replace(/\|/g, '\\|') : '');
  const ref = out.after || out.before;
  let md = `# Kết quả đo (${new Date().toLocaleString('vi')})\n\n| TH | Tiêu chí | Trước khi sửa | Sau khi sửa |\n|---|---|---|---|\n`;
  ref.forEach((r, i) => {
    md += `| ${r.sc} | ${r.check} | ${cell(out.before && out.before[i])} | ${cell(out.after && out.after[i])} |\n`;
  });
  for (const k of Object.keys(out)) md += `\n**${k}**: ${out[k].filter((r) => r.pass).length}/${out[k].length} tiêu chí đạt.`;
  fs.writeFileSync(path.join(ROOT, 'results', 'summary.md'), md + '\n');
}

(async () => {
  const which = process.argv[2] ? [process.argv[2]] : ['before', 'after'];
  fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
  const out = {};
  try {
    for (const v of which) out[v] = await runVersion(v);
  } finally { procs.forEach((p) => p.exitCode === null && p.kill()); }
  writeSummary(out);
  for (const k of Object.keys(out)) console.log(`\n${k}: ${out[k].filter((r) => r.pass).length}/${out[k].length} tiêu chí ĐẠT`);
  console.log('Bảng so sánh: results/summary.md');
})();
