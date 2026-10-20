// Cấu hình Fee Service (đọc từ biến môi trường)
module.exports = {
  PORT: Number(process.env.PORT || 4001),
  BANK_URL: process.env.BANK_URL || 'http://localhost:4002',
  DEADLINE_MS: 4000,   // tổng thời gian chờ ngân hàng, kể cả các lần thử lại (< 4,5s)
  MAX_ATTEMPTS: 4,     // 0,3^4 ≈ 0,8% lệnh còn lỗi sau 4 lần thử
  MAX_SOCKETS: 20,     // tối đa 20 kết nối TCP tới ngân hàng
  IDLE_SOCKET_MS: 3000 // < 5000 (keepAliveTimeout của ngân hàng)
};
