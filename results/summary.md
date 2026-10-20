# Kết quả đo (10:22:15 20/10/2026)

| TH | Tiêu chí | Trước khi sửa | Sau khi sửa |
|---|---|---|---|
| TH1 | Bank tắt -> 503 + error, < 1,5s | ❌ 500 FAILED 25ms {"error":"","paymentId":"P1","status":"FAILED"} | ✅ 503 FAILED 22ms {"error":"Bank unavailable","paymentId":"P1","status":"FAILED"} |
| TH1 | Fee Service sống, GET fees 200 nhanh | ✅ 200 1ms | ✅ 200 1ms |
| TH1 | Bank chạy lại -> 201 không cần restart | ✅ 201 PAID 4ms | ✅ 201 PAID 4ms |
| TH1 | BANK_URL=http://localhost:4999 -> vẫn 503 | ❌ 500 FAILED 22ms | ✅ 503 FAILED 20ms |
| TH2 | 1 thanh toán -> 504 PENDING | ❌ 201 PAID 5037ms | ✅ 504 PENDING 4031ms |
| TH2 | Thời gian trả lời <= 4,5s | ❌ 5037ms | ✅ 4031ms |
| TH2 | GET fees khi 20 thanh toán đang chờ < 300ms | ✅ 2, 2, 4, 1, 4 ms | ✅ 3, 1, 3, 3, 2 ms |
| TH2 | 20 thanh toán đồng thời: 504 PENDING, <= 4,5s | ❌ 0/20 PENDING, chậm nhất 5038ms, tổng 5041ms | ✅ 20/20 PENDING, chậm nhất 4026ms, tổng 4028ms |
| TH3 | 200/200 thành công | ✅ 200/200 trong 212ms | ✅ 200/200 trong 124ms |
| TH3 | Số kết nối TCP <= 20 | ❌ connections=201 | ✅ connections=11 |
| TH3 | Sau 6s nhàn rỗi, 5 yêu cầu tiếp theo thành công | ✅ 201,201,201,201,201 | ✅ 201,201,201,201,201 |
| TH4a | >= 54/60 PAID | ❌ 42/60; không thành công: 18×(500 FAILED) | ✅ 60/60; không thành công: không có |
| TH4a | Lệnh không thành công trả 504 PENDING | ❌ 18×(500 FAILED) | ✅ không có |
| TH4a | duplicates = 0 | ✅ charges=60, requests=60, duplicates=0, connections=61 | ✅ charges=60, requests=81, duplicates=0, connections=23 |
| TH4a | Công nợ giảm đúng tiền các lệnh PAID | ✅ giảm 42.000đ, PAID 42×1.000đ | ✅ giảm 60.000đ, PAID 60×1.000đ |
| TH4a | Mỗi thanh toán <= 4,5s | ✅ chậm nhất 25ms | ✅ chậm nhất 68ms |
| TH4b | >= 54/60 PAID | ❌ 43/60; không thành công: 17×(500 FAILED) | ✅ 60/60; không thành công: không có |
| TH4b | duplicates = 0 | ✅ charges=43, requests=60, duplicates=0, connections=61 | ✅ charges=60, requests=74, duplicates=0, connections=2 |
| TH4b | Công nợ giảm đúng tiền các lệnh PAID | ✅ giảm 43.000đ, PAID 43×1.000đ | ✅ giảm 60.000đ, PAID 60×1.000đ |
| TH4b | Mỗi thanh toán <= 4,5s | ✅ chậm nhất 22ms | ✅ chậm nhất 176ms |
| TH4c | Trả 402 FAILED | ✅ 402 FAILED 22ms {"error":"limit exceeded","paymentId":"P1","status":"FAILED"} | ✅ 402 FAILED 26ms {"error":"limit exceeded","paymentId":"P1","status":"FAILED"} |
| TH4c | Ngân hàng nhận đúng 1 yêu cầu | ✅ requests=1 | ✅ requests=1 |
| NV | SV2 nợ 0 -> không cho thanh toán | ✅ 400 {"error":"Amount exceeds debt"} | ✅ 400 {"error":"Amount exceeds debt","paymentId":null,"status":"FAILED"} |
| NV | SV3 trả 3,3tr > nợ 3,2tr -> 400 | ✅ 400 | ✅ 400 |
| NV | 2 lệnh 3tr song song cho SV3 -> chỉ 1 lệnh qua, nợ không âm | ❌ 201,201; nợ còn -2800000 | ✅ 201,400; nợ còn 200000 |

**before**: 15/25 tiêu chí đạt.
**after**: 25/25 tiêu chí đạt.
