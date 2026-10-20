module.exports = {
  PORT: Number(process.env.PORT || 4001),
  BANK_URL: process.env.BANK_URL || 'http://localhost:4002',
  DEADLINE_MS: 4000,
  MAX_ATTEMPTS: 4,
  MAX_SOCKETS: 20,
  IDLE_SOCKET_MS: 3000
};
