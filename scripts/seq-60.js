// TH4a/b: gửi 60 thanh toán lần lượt, so số lệnh PAID với charges / duplicates ở /stats
// Bật bank với DROP_RATE=0.3 (npm run bank:drop) hoặc FAIL_RATE=0.3 (npm run bank:fail) + fee service.
// Chạy: npm run seq:60
const { pay, fees, stats, tally } = require('./lib');

(async () => {
  const debt0 = (await fees()).body.debt;
  const s0 = await stats();
  const results = [];
  for (let i = 0; i < 60; i++) results.push(await pay(1, 1000));
  const s1 = await stats();
  const debt1 = (await fees()).body.debt;
  const paid = results.filter((r) => r.code === 201).length;

  console.log('Kết quả 60 thanh toán:', tally(results));
  console.log(`PAID = ${paid}, bank charges = ${s1.charges - s0.charges}, requests = ${s1.requests - s0.requests}, duplicates = ${s1.duplicates}`);
  console.log(`Công nợ giảm ${debt0 - debt1}đ (PAID × 1.000 = ${paid * 1000}đ)`);
  console.log(`Thanh toán chậm nhất: ${Math.max(...results.map((r) => r.ms))}ms`);
})();
