// Dữ liệu trong bộ nhớ
const debts = { 1: 50_000_000, 2: 0, 3: 3_200_000 };
const reserved = { 1: 0, 2: 0, 3: 0 }; // tiền của các lệnh đang xử lý / PENDING
const payments = new Map();
let seq = 0;

module.exports = {
  debts,
  reserved,
  payments,
  hasStudent: (id) => id in debts,
  available: (id) => debts[id] - reserved[id],
  nextPaymentId: () => 'P' + ++seq,
};
