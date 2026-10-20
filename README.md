# Lab 3 – Kết nối và duy trì kết nối giữa các service

Fee Service (cổng 4001) gọi ngân hàng giả lập (cổng 4002) để thu học phí, và xử lý 4 tình huống sự cố:
ngân hàng tắt, ngân hàng chậm, duy trì kết nối, đứt giữa chừng / lỗi tạm thời / bị từ chối.

## Cấu trúc thư mục

```
.
├── bank-service/
│   └── server.js            Ngân hàng giả lập: POST /charges, GET /stats, Idempotency-Key,
│                            DELAY_MS / FAIL_RATE / DROP_RATE, log mỗi kết nối TCP mới
├── fee-service/
│   ├── server.js            Fee Service ĐÃ SỬA: các route Express
│   ├── bankClient.js        Gọi ngân hàng: keep-alive, timeout 4s, retry + Idempotency-Key
│   ├── store.js             Dữ liệu trong bộ nhớ (công nợ, giữ chỗ, lệnh thanh toán)
│   ├── config.js            Cấu hình (PORT, BANK_URL, thời gian chờ, số socket)
│   └── server-before.js     Fee Service TRƯỚC KHI SỬA (để đo so sánh)
├── scripts/
│   ├── lib.js               Hàm dùng chung (pay, fees, stats)
│   ├── burst-20.js          TH2: 20 thanh toán đồng thời + đo GET fees
│   ├── load-200.js          TH3: 200 thanh toán, 10 đồng thời + nhàn rỗi 6s
│   ├── seq-60.js            TH4: 60 thanh toán lần lượt, so PAID với /stats
│   └── run-all.js           Tự bật/tắt service, đo cả 4 TH cho bản trước và sau
├── postman/
│   └── Lab3.postman_collection.json
├── results/
│   ├── before.json          Kết quả đo bản trước
│   ├── after.json           Kết quả đo bản sau
│   └── summary.md           Bảng so sánh trước / sau (sinh tự động)
├── BAO_CAO.md               Báo cáo trình bày: cách làm, số liệu, nhận xét
├── .env.example
└── package.json
```

## Cài đặt

Yêu cầu Node.js ≥ 18.

```bash
npm install
```

## Chạy

| Lệnh | Ý nghĩa |
|---|---|
| `npm run bank` | Ngân hàng bình thường |
| `npm run bank:slow` | Ngân hàng chậm `DELAY_MS=5000` (TH2) |
| `npm run bank:drop` | `DROP_RATE=0.3`: trừ tiền rồi cắt kết nối (TH4a) |
| `npm run bank:fail` | `FAIL_RATE=0.3`: lỗi 500 trước khi trừ tiền (TH4b) |
| `npm run fee` | Fee Service đã sửa |
| `npm run fee:before` | Fee Service trước khi sửa |
| `npm run fee:4999` | Fee Service với `BANK_URL=http://localhost:4999` (TH1) |
| `npm run burst:20` | Script đo TH2 (cần bank + fee đang chạy) |
| `npm run load:200` | Script đo TH3 |
| `npm run seq:60` | Script đo TH4a/b |
| `npm test` | **Đo tự động toàn bộ** (trước + sau), ghi `results/` (~1 phút) |

Các tham số khác (PowerShell): `$env:DELAY_MS=2000; npm run bank`.

## Demo từng tình huống (mỗi lệnh một terminal)

**TH1 – ngân hàng tắt rồi chạy lại**
1. `npm run fee` (chưa bật bank)
2. Postman: *POST thanh toán 100.000* → `503 FAILED`, khoảng 20ms. *GET fees SV1* → 200.
3. `npm run bank`, rồi gửi lại thanh toán → `201 PAID` (không restart Fee Service).

**TH2 – ngân hàng chậm**
1. `npm run bank:slow` và `npm run fee`
2. `npm run burst:20` → 504 PENDING sau khoảng 4s; GET fees vẫn chỉ vài ms.

**TH3 – duy trì kết nối**
1. `npm run bank` và `npm run fee` (so sánh: `npm run fee:before`)
2. `npm run load:200` → 200/200, khoảng 11 kết nối (bản trước: khoảng 200 kết nối).

**TH4 – đứt giữa chừng / lỗi tạm thời / từ chối**
1. `npm run bank:drop` (hoặc `bank:fail`) và `npm run fee`
2. `npm run seq:60` → 60/60 PAID, `duplicates = 0`
3. (c) `npm run bank`, Postman *POST thanh toán 25.000.000* → `402`, `/stats` có `requests = 1`.

Khởi động lại bank và fee giữa các lần đo để `/stats` và công nợ về giá trị ban đầu.

## API

**Fee Service – http://localhost:4001**

| Method | Path | Mô tả |
|---|---|---|
| GET | `/students/{id}/fees` | `{ studentId, debt }`. SV1 = 50.000.000, SV2 = 0, SV3 = 3.200.000 |
| POST | `/students/{id}/payments` | Body `{"amount": 100000}` |
| GET | `/payments/{paymentId}` | Trạng thái lệnh |

Kết quả thanh toán:

| Tình trạng | HTTP | status |
|---|---|---|
| Ngân hàng xác nhận đã trừ | 201 | PAID |
| Ngân hàng từ chối (vượt hạn mức…) | mã của ngân hàng (402, 400) | FAILED |
| Không kết nối được ngân hàng | 503 | FAILED |
| Hết thời gian / đứt kết nối khi chờ | 504 | PENDING |
| Số tiền sai / vượt công nợ | 400 | FAILED |

Lỗi luôn là JSON `{ error, paymentId, status }`.

**Ngân hàng – http://localhost:4002**

| Method | Path | Mô tả |
|---|---|---|
| POST | `/charges` | Body `{ reference, amount }`, header `Idempotency-Key`. 201 / 400 / 402 / 500 |
| GET | `/stats` | `{ connections, requests, charges, duplicates }` |
