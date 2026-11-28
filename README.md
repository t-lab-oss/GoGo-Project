# Go!Go!

Go!Go! là web app dùng cho từng chuyến đi: chuẩn bị quán theo cụm trước chuyến, trong chuyến lướt thẻ quán để chọn, chụp ảnh để check-in, ghi chi tiêu và xem recap sau chuyến. Giao diện ưu tiên điện thoại.

## Công nghệ

| Phần | Công nghệ |
| --- | --- |
| Frontend | Angular 19, Tailwind CSS 3.4, Leaflet (bản đồ), IndexedDB (`idb`) |
| Backend | Node.js, Express 5, Mongoose (MongoDB), Zod, JWT, Pino |
| Lưu ảnh | Supabase Storage (bucket private) |
| Gợi ý quán | Google Places API (New) |
| Kiểm thử | Karma + Jasmine (web), Vitest + Supertest + mongodb-memory-server (server) |

## Cấu trúc thư mục

```
.
├── projects/
│   ├── web/        # Ứng dụng Angular
│   └── shared/     # Mã dùng chung
├── server/
│   ├── src/        # API Express (config, lib, middlewares, modules)
│   ├── seed/       # Script nạp dữ liệu mẫu
│   └── test/       # Test của server
├── docs/           # Tài liệu: yêu cầu, API, thiết kế database, quy tắc Angular
├── proxy.conf.json # Proxy /api sang server khi chạy dev
└── .env.example    # Mẫu biến môi trường
```

## Yêu cầu

- Node.js (đã chạy được với Node 26) và npm
- MongoDB: Atlas M0 hoặc cài local
- Tài khoản Supabase (lưu ảnh) và khoá Google Places API (gợi ý quán)

## Cài đặt

```bash
npm install
cp .env.example .env
```

Mở `.env` và điền giá trị thật. **Không commit file `.env`.**

| Biến | Ý nghĩa |
| --- | --- |
| `NODE_ENV`, `PORT` | Môi trường và cổng API (mặc định 3001) |
| `FRONTEND_ORIGIN` | Origin của frontend để cấu hình CORS (mặc định `http://localhost:4200`) |
| `MONGODB_URI` | Chuỗi kết nối MongoDB |
| `JWT_ACCESS_SECRET` | Khoá ký access token |
| `ACCESS_TOKEN_TTL_SECONDS` | Thời hạn access token (mặc định 15 phút). Refresh token được băm và lưu trong collection `refreshTokens` |
| `REFRESH_TOKEN_TTL_DAYS` | Thời hạn refresh token |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Cấu hình Supabase Storage |
| `GOOGLE_PLACES_API_KEY` | Khoá Google Places API |
| `PLACES_DAILY_CAP` | Giới hạn số lượt gọi Places mỗi ngày ở phía app. Nên đặt thêm quota trên Google Cloud |

## Chạy khi phát triển

Cần chạy cả database, API và frontend, mỗi cái một terminal:

```bash
# 1. MongoDB local (bỏ qua nếu dùng Atlas)
npm run db:start

# 2. API tại http://localhost:3001
npm run dev:server

# 3. Frontend tại http://localhost:4200 (tự proxy /api sang API)
npm start
```

Nạp dữ liệu mẫu:

```bash
npm run seed
```

## Thử PWA và offline

Service worker chỉ bật ở bản build, nên `npm start` không mở lại được app khi mất mạng.

```bash
npm run dev:server   # API
npm run preview      # build rồi chạy tại http://localhost:4300
```

Mở http://localhost:4300, đăng nhập, đợi khoảng 10 giây cho service worker lưu giao diện, rồi tắt mạng. Check-in, ảnh, khoảnh khắc và chi tiêu được lưu trên máy và tự gửi khi có mạng. Cài app lên điện thoại cần chạy qua HTTPS.

## Các lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `npm start` | Chạy frontend ở chế độ dev, kèm proxy |
| `npm run build` | Build frontend vào `dist/` |
| `npm run watch` | Build frontend liên tục ở chế độ development |
| `npm run dev:server` | Chạy API, tự khởi động lại khi sửa code |
| `npm run build:server` | Biên dịch server |
| `npm run start:api` | Chạy server đã build |
| `npm run typecheck:server` | Kiểm tra kiểu cho server |
| `npm run test:web` | Chạy test frontend một lần |
| `npm run test:server` | Chạy test server |
| `npm run seed` | Nạp dữ liệu mẫu |
| `npm run preview` | Build rồi chạy thử bản có service worker ở cổng 4300 |

## Tài liệu

- [Yêu cầu sản phẩm](docs/requirement.md)
- [API Contract](docs/API%20Contract.md)
- [Thiết kế database](docs/Database%20Design.md)
- [Quy tắc Angular](docs/QUY_TAC_ANGULAR.md)
