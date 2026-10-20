const { sleep, pay, fees, tally } = require('./lib');

(async () => {
  const one = await pay(1, 100000);
  console.log(`1 thanh toán: ${one.code} ${one.body.status} - ${one.ms}ms`);

  const t = Date.now();
  const all = Promise.all(Array.from({ length: 20 }, () => pay(1, 100000)));
  await sleep(500);
  const lat = [];
  for (let i = 0; i < 5; i++) { lat.push((await fees()).ms); await sleep(200); }
  const results = await all;
  console.log(`GET /students/1/fees khi 20 thanh toán đang chờ: ${lat.join(', ')} ms`);
  console.log('20 thanh toán:', tally(results));
  console.log(`Chậm nhất ${Math.max(...results.map((r) => r.ms))}ms, tổng ${Date.now() - t}ms`);
})();
