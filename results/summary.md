# Kết quả đo (10:31:07 20/10/2026)

| TH | Tiêu chí | Trước khi sửa | Sau khi sửa |
|---|---|---|---|
| TH1 | Bank tắt -> 503 + error, < 1,5s | ❌ 500 FAILED 24ms {"error":"","paymentId":"P1","status":"FAILED"} | ✅ 503 FAILED 22ms {"error":"Bank unavailable","paymentId":"P1","status":"FAILED"} |
| TH1 | Fee Service sống, GET fees 200 nhanh | ✅ 200 1ms | ✅ 200 0ms |
| TH1 | Bank chạy lại -> 201 không cần restart | ✅ 201 PAID 4ms | ✅ 201 PAID 4ms |
| TH1 | BANK_URL=http://localhost:4999 -> vẫn 503 | ❌ 500 FAILED 21ms | ✅ 503 FAILED 20ms |
| TH2 | 1 thanh toán -> 504 PENDING | ❌ 201 PAID 5033ms | ✅ 504 PENDING 4025ms |
| TH2 | Thời gian trả lời <= 4,5s | ❌ 5033ms | ✅ 4025ms |
| TH2 | GET fees khi 20 thanh toán đang chờ < 300ms | ✅ 4, 3, 2, 4, 3 ms | ✅ 2, 2, 3, 1, 2 ms |
| TH2 | 20 thanh toán đồng thời: 504 PENDING, <= 4,5s | ❌ 0/20 PENDING, chậm nhất 5032ms, tổng 5034ms | ✅ 20/20 PENDING, chậm nhất 4027ms, tổng 4029ms |
| TH3 | 200/200 thành công | ✅ 200/200 trong 203ms | ✅ 200/200 trong 128ms |
| TH3 | Số kết nối TCP <= 20 | ❌ connections=201 | ✅ connections=11 |
| TH3 | Sau 6s nhàn rỗi, 5 yêu cầu tiếp theo thành công | ✅ 201,201,201,201,201 | ✅ 201,201,201,201,201 |
| TH4a | >= 54/60 PAID | ❌ 35/60; không thành công: 25×(500 FAILED) | ✅ 60/60; không thành công: không có |
| TH4a | Lệnh không thành công trả 504 PENDING | ❌ 25×(500 FAILED) | ✅ không có |
| TH4a | duplicates = 0 | ✅ charges=60, requests=60, duplicates=0, connections=61 | ✅ charges=60, requests=80, duplicates=0, connections=22 |
| TH4a | Công nợ giảm đúng tiền các lệnh PAID | ✅ giảm 35.000đ, PAID 35×1.000đ | ✅ giảm 60.000đ, PAID 60×1.000đ |
| TH4a | Mỗi thanh toán <= 4,5s | ✅ chậm nhất 21ms | ✅ chậm nhất 64ms |
| TH4b | >= 54/60 PAID | ❌ 44/60; không thành công: 16×(500 FAILED) | ✅ 59/60; không thành công: 1×(503 FAILED) |
| TH4b | duplicates = 0 | ✅ charges=44, requests=60, duplicates=0, connections=61 | ✅ charges=59, requests=94, duplicates=0, connections=3 |
| TH4b | Công nợ giảm đúng tiền các lệnh PAID | ✅ giảm 44.000đ, PAID 44×1.000đ | ✅ giảm 59.000đ, PAID 59×1.000đ |
| TH4b | Mỗi thanh toán <= 4,5s | ✅ chậm nhất 20ms | ✅ chậm nhất 528ms |
| TH4c | Trả 402 FAILED | ✅ 402 FAILED 22ms {"error":"limit exceeded","paymentId":"P1","status":"FAILED"} | ✅ 402 FAILED 22ms {"error":"limit exceeded","paymentId":"P1","status":"FAILED"} |
| TH4c | Ngân hàng nhận đúng 1 yêu cầu | ✅ requests=1 | ✅ requests=1 |
| NV | SV2 nợ 0 -> không cho thanh toán | ✅ 400 {"error":"Amount exceeds debt"} | ✅ 400 {"error":"Amount exceeds debt","paymentId":null,"status":"FAILED"} |
| NV | SV3 trả 3,3tr > nợ 3,2tr -> 400 | ✅ 400 | ✅ 400 |
| NV | 2 lệnh 3tr song song cho SV3 -> chỉ 1 lệnh qua, nợ không âm | ❌ 201,201; nợ còn -2800000 | ✅ 201,400; nợ còn 200000 |

**before**: 15/25 tiêu chí đạt.
**after**: 25/25 tiêu chí đạt.
