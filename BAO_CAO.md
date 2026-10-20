# Lab 3 – Kết nối và duy trì kết nối giữa các service

## 1. Cấu trúc

Xem chi tiết thư mục và lệnh chạy trong `README.md`.

- `bank-service/server.js`: ngân hàng giả lập
- `fee-service/`: Fee Service đã sửa (`server.js`, `bankClient.js`, `store.js`, `config.js`)
- `fee-service/server-before.js`: bản trước khi sửa (kết nối mới mỗi lần, không timeout, không retry)
- `scripts/`: script đo (`burst-20`, `load-200`, `seq-60`, `run-all`)
- `postman/`: collection Postman
- `results/`: số liệu trước / sau (`summary.md` sinh tự động bởi `npm test`)

## 2. Ý tưởng chính trong Fee Service

```
POST /payments ─► kiểm tra amount ≤ nợ − tiền đang giữ chỗ ─► tạo P{n}, giữ chỗ
                ─► charge(): tối đa 4 lần, tổng ≤ 4000ms, Idempotency-Key = P{n}
                      201            → PAID, giảm nợ                    (201)
                      4xx            → FAILED, không thử lại            (giữ mã ngân hàng)
                      5xx            → thử lại (chưa trừ tiền)
                      ECONNREFUSED   → FAILED, chắc chắn chưa trừ       (503)
                      đứt kết nối    → thử lại cùng khóa (có thể đã trừ)
                      hết 4000ms     → PENDING                          (504)
```

| Kỹ thuật | Giải quyết |
|---|---|
| `BANK_URL` đọc từ env; mỗi lời gọi mở/lấy kết nối mới, không lưu trạng thái lỗi | TH1: ngân hàng lên lại là chạy ngay |
| Phân loại lỗi: *không kết nối được* (503) vs *không biết kết quả* (504) | TH1, TH4a |
| Timer tổng 4000ms (bao cả thời gian chờ lấy socket và các lần retry), hết giờ thì `req.destroy()` | TH2 |
| Node xử lý bất đồng bộ, lời gọi ngân hàng không chặn event loop | TH2: GET fees vẫn nhanh |
| `http.Agent({ keepAlive: true, maxSockets: 20 })` | TH3: tái dùng kết nối, ≤ 20 kết nối |
| Agent `timeout: 3000` < `keepAliveTimeout` 5000 của ngân hàng | TH3: không gửi vào socket ngân hàng đã đóng |
| `Idempotency-Key = paymentId` + retry với backoff 50/100/150ms | TH4a, TH4b: thử lại an toàn, không trừ 2 lần |
| Không retry 4xx | TH4c: 402, ngân hàng chỉ nhận 1 yêu cầu |
| Giữ chỗ (`reserved`) số tiền đang xử lý | 2 lệnh song song không làm nợ âm |

## 3. Số liệu trước / sau khi sửa (một lần chạy `npm test`; bảng đầy đủ ở `results/summary.md`)

| Tình huống | Chỉ số | Trước (naive) | Sau (đã sửa) |
|---|---|---|---|
| **TH1** bank tắt | Mã trả về / thời gian | 500, error rỗng, 22ms | **503** `Bank unavailable`, 22ms |
| | GET fees | 200, 1ms | 200, 1ms |
| | Bank lên lại (không restart Fee) | 201 | 201 |
| | `BANK_URL=:4999` | 500 | **503**, 20ms |
| **TH2** DELAY 5000 | 1 thanh toán | 201 sau **5038ms** | **504 PENDING sau 4037ms** |
| | 20 thanh toán đồng thời | 20×201, chậm nhất 5038ms | **20×504 PENDING, chậm nhất 4033ms** |
| | GET fees trong lúc chờ | 1–4ms | 1–5ms |
| **TH3** 200 lệnh, 10 song song | Thành công | 200/200 (215ms) | 200/200 (130ms) |
| | Kết nối TCP | **201** | **11** |
| | Sau 6s nhàn rỗi | 5/5 | 5/5 |
| **TH4a** DROP 0.3 | PAID / 60 | **45** (15×500) | **60** |
| | charges / requests / duplicates | 60 / 60 / 0 | 60 / 78 / 0 |
| | Kết nối TCP | 61 | 20 |
| **TH4b** FAIL 0.3 | PAID / 60 | **41** (19×500) | **60** |
| | charges / requests / duplicates | 41 / 60 / 0 | 60 / 83 / 0 |
| | Chậm nhất | 22ms | 319ms |
| **TH4c** 25.000.000đ | Kết quả / số yêu cầu tới bank | 402 / 1 | 402 FAILED / 1 |
| **Nghiệp vụ** | 2 lệnh 3tr song song cho SV3 (nợ 3,2tr) | 201 + 201 → **nợ −2.800.000** | 201 + 400 → nợ 200.000 |

Kết quả bản đã sửa: **25/25 tiêu chí đạt**.

## 4. Nhận xét

1. **TH1.** Bản naive không sập, nhưng trả 500 với thông báo rỗng, nên người dùng không biết nên thử lại hay không. Bản sửa trả 503: *chắc chắn chưa trừ tiền, có thể thử lại*.
2. **TH2.** Không có timeout thì Fee Service chờ theo ngân hàng. Ngân hàng chậm bao lâu thì sinh viên chờ bấy lâu, và mọi request treo đều giữ tài nguyên. Bản sửa cắt ở 4s và trả PENDING. Trả FAILED ở đây là **sai**, vì ngân hàng có thể vẫn trừ tiền sau đó.
3. **TH3.** Không keep-alive thì mỗi thanh toán tốn 1 lần bắt tay TCP (201 kết nối). Có keep-alive thì 11 kết nối dùng cho 200 lệnh. Bẫy cần tránh: ngân hàng đóng socket nhàn rỗi sau 5s; nếu client đúng lúc đó gửi vào socket ấy thì gặp `ECONNRESET`. Vì vậy client tự đóng socket nhàn rỗi sớm hơn (3s).
4. **TH4a là điểm quan trọng nhất.** Bản naive có `charges=60` nhưng chỉ 45 PAID: **15 sinh viên đã bị trừ tiền mà công nợ không giảm**, và hệ thống còn báo FAILED. Nếu sinh viên bấm thanh toán lại thì bị trừ tiền lần nữa. Bản sửa gửi lại **cùng Idempotency-Key**, ngân hàng trả giao dịch cũ, nên 60/60 PAID, `duplicates=0`, số requests (78) > charges (60).
5. **TH4b.** Lỗi 500 xảy ra *trước khi trừ tiền* nên thử lại là an toàn. Thời gian tăng nhẹ (backoff), nhưng vẫn rất xa ngưỡng 4,5s.
6. **TH4c.** 402 là lỗi nghiệp vụ, thử lại cũng chỉ bị từ chối tiếp. Chỉ thử lại lỗi *tạm thời* (5xx, đứt kết nối), không thử lại 4xx.
7. **Giới hạn còn lại.** Lệnh PENDING (ví dụ TH2) cần **đối soát** sau: gọi lại ngân hàng với cùng Idempotency-Key, hoặc dùng API tra cứu, để chuyển sang PAID/FAILED. Tiền của lệnh PENDING đang được giữ chỗ nên không bị thanh toán trùng trong lúc chờ. Bài lab không yêu cầu phần đối soát nên chưa làm.
