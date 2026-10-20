// TH3: gửi 200 thanh toán, 10 yêu cầu cùng lúc (1.000đ mỗi lần), rồi đo lại sau 6s nhàn rỗi
// Cần bật sẵn bank + fee service.  Chạy: npm run load:200
const { sleep, pay, stats, tally } = require('./lib');

const TOTAL = Number(process.argv[2] || 200);
const CONCURRENCY = Number(process.argv[3] || 10);

(async () => {
  const before = await stats();
  const t = Date.now(); const results = []; let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next++ < TOTAL) results.push(await pay(1, 1000));
  }));
  const ms = Date.now() - t;
  const after = await stats();
  console.log(`${TOTAL} thanh toán, ${CONCURRENCY} đồng thời: ${ms}ms`);
  console.log('Kết quả:', tally(results));
  console.log(`Kết nối TCP mới ngân hàng phải mở: ${after.connections - before.connections}`);
  console.log('Bank /stats:', after);

  console.log('\nNhàn rỗi 6 giây...');
  await sleep(6000);
  const again = [];
  for (let i = 0; i < 5; i++) again.push(await pay(1, 1000));
  console.log('5 yêu cầu sau nhàn rỗi:', again.map((r) => r.code).join(', '));
})();
