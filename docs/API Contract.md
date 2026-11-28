# Go!Go! – API Contract (v0.2) · REST

*23/11/2026 · Bản v0.2 chuyển các route "hành động" của v0.1 sang **REST thuần**. Khớp với Product Requirements v0.2 và Tech Spec v0.1. Database Design v0.1 và Tech Spec cần chỉnh nhẹ theo mục 16.*

## 1. Nguyên tắc REST của bản này

| Nguyên tắc | Áp dụng |
| --- | --- |
| Tài nguyên là danh từ số nhiều | `/trips`, `/trips/:tripId/clusters`, `/places`, `/checkins`, `/moments`… |
| Mọi tài nguyên con nằm dưới `/trips/:tripId` | Quyền thành viên luôn kiểm tra từ đường dẫn. Người ngoài nhận `404 TRIP_NOT_FOUND` (không lộ việc chuyến có tồn tại) |
| `GET` an toàn | Không có tác dụng phụ ghi dữ liệu. Có thể tốn lượt gọi Google nhưng không đổi trạng thái |
| `PUT`, `PATCH`, `DELETE` idempotent | Gửi lại nhiều lần cho kết quả như một lần |
| `DELETE` không có body | Xác nhận phụ truyền qua query (`?confirmName=`) |
| Lọc, sắp xếp, mở rộng qua query | `?date=`, `?status=`, `?sort=`, `?limit=`, `?include=places,checkins` |
| ID do client sinh cho dữ liệu tạo offline | `PUT /…/:id` tạo tài nguyên, thay cho `clientId` và `POST` |
| Mã trạng thái chuẩn | `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `5xx` |

### Quy ước dữ liệu

| Chủ đề | Quy ước |
| --- | --- |
| Base URL | `/api` (cùng origin với frontend nhờ rewrite) |
| Định dạng | JSON, UTF-8 |
| Xác thực | `Authorization: Bearer <accessToken>` (sống 15 phút). Refresh token trong cookie `gg_rt` (httpOnly, Secure, SameSite=Lax, path `/api/sessions`, 30 ngày, xoay mỗi lần refresh) |
| ID | 24 ký tự hex. **Check-in và khoảnh khắc do client sinh** (12 byte ngẫu nhiên đổi sang hex, dạng `^[0-9a-f]{24}$`). Các tài nguyên khác do server sinh |
| Thời điểm | ISO 8601 UTC |
| Ngày, giờ | `"YYYY-MM-DD"` và `"HH:mm"` theo múi giờ của Trip |
| Tiền | Số nguyên VND |
| Thông điệp lỗi | Tiếng Việt, nói rõ cách xử lý, không đổ lỗi cho người dùng |
| Bộ nhớ đệm | Phản hồi có dữ liệu Google (`place-candidate`, `google-data`, `include=google`) đặt `Cache-Control: no-store` |
| Phân trang | Chỉ danh sách khoảnh khắc: `?limit=30&cursor=…` → `{ items, nextCursor }` |

### Tạo bản ghi offline (thay cho `clientId`)

- Client sinh ID rồi `PUT /trips/:tripId/checkins/:checkinId` (hoặc `moments/:momentId`). **Lần đầu** trả `201`. **Gửi lại** cùng ID cho cùng người dùng trả `200` với bản đã có, không đổi gì. Chỉnh sửa sau đó dùng `PATCH`. Đây là quy ước "tạo idempotent" của bản này.
- ID đã thuộc tài nguyên của người khác hoặc chuyến khác: `409 ID_CONFLICT`.
- Không cần bảng ánh xạ ID tạm sang ID thật: client đã biết ID ngay từ lúc tạo. Hàng đợi vẫn phải gửi **theo thứ tự tạo** (check-in trước, tiền sau) vì tiền phụ thuộc vào check-in có sẵn. Tiền gửi sớm quá nhận `404 CHECKIN_NOT_FOUND`, client giữ lại và gửi lại sau.

### Định dạng lỗi

```json
{ "error": { "code": "USERNAME_TAKEN", "message": "Tên này đã có người dùng.",
             "details": { "suggestions": ["tien1", "tien.gg"] } } }
```

Lỗi kiểm tra dữ liệu: `details` là mảng `[{ "field": "endDate", "message": "Ngày về phải sau hoặc cùng ngày đi." }]`.

## 2. Mã lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Dữ liệu sai định dạng hoặc thiếu |
| 400 | `INVALID_MAPS_URL` | Link không thuộc các host Google Maps cho phép |
| 400 | `CONFIRM_NAME_MISMATCH` | `confirmName` không khớp tên chuyến khi xoá |
| 401 | `UNAUTHENTICATED` | Thiếu hoặc hết hạn access token |
| 401 | `INVALID_CREDENTIALS` | Sai tên đăng nhập hoặc mật khẩu |
| 401 | `REFRESH_INVALID` | Refresh token không hợp lệ hoặc đã bị thu hồi |
| 403 | `FORBIDDEN` | Không đủ quyền (ví dụ không phải chủ chuyến) |
| 403 | `OWNER_CANNOT_LEAVE` | Chủ chuyến cố rời chuyến |
| 404 | `TRIP_NOT_FOUND`, `PLACE_NOT_FOUND`, `CLUSTER_NOT_FOUND`, `CHECKIN_NOT_FOUND`, `EXPENSE_NOT_FOUND`, `MOMENT_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `USER_NOT_FOUND`, `SHARE_NOT_FOUND` | Không tìm thấy |
| 409 | `USERNAME_TAKEN` | Tên đăng nhập trùng |
| 409 | `ALREADY_MEMBER` | Người được mời đã ở trong chuyến |
| 409 | `PLACE_ALREADY_IN_CLUSTER` | Quán đã có trong cụm |
| 409 | `CLUSTER_NOT_EMPTY`, `CLUSTER_PROTECTED` | Xoá cụm còn quán, hoặc xoá cụm mặc định |
| 409 | `DAYS_HAVE_DATA` | Rút ngắn ngày làm mất ngày đang có dữ liệu, cần xác nhận |
| 409 | `ALREADY_CHECKED_IN` | Quán đã có check-in trong ngày đó (`details.checkinId`) |
| 409 | `ID_CONFLICT` | ID do client sinh đã thuộc tài nguyên khác |
| 409 | `NO_GOOGLE_PLACE` | Quán thêm tay, không có `placeId` để lấy dữ liệu Google |
| 422 | `PLACE_NOT_RESOLVED` | Không đổi được link thành một quán duy nhất |
| 422 | `DATE_OUT_OF_RANGE` | Ngày nằm ngoài khoảng ngày của chuyến |
| 422 | `PHOTO_NOT_FOUND` | Ảnh chưa được tải lên Supabase |
| 422 | `TOO_MANY_PLACES` | `include=google` cho hơn 10 quán |
| 429 | `RATE_LIMITED` | Gọi quá nhanh (header `Retry-After`) |
| 502 | `PLACES_UPSTREAM_ERROR` | Google trả lỗi |
| 503 | `PLACES_QUOTA_EXCEEDED` | Hết cap hoặc hạn mức Google trong ngày. Phần còn lại của app vẫn dùng được |

## 3. Models

```jsonc
// User
{ "id": "…", "username": "tien", "publicId": "GG-7K3F9Q",
  "avatarUrl": null }               // data URL JPEG, null thì hiện chữ cái đầu

// TripSummary
{ "id": "…", "name": "Đà Lạt 3N2Đ", "destination": "Đà Lạt",
  "startDate": "2026-12-05", "endDate": "2026-12-07",
  "status": "upcoming",            // upcoming | ongoing | finished
  "dayCount": 3, "memberCount": 2, "coverUrl": null }

// Trip  (TripSummary + chi tiết)
{ …TripSummary, "destinationGeo": { "lat": 11.94, "lng": 108.45 },
  "tz": "Asia/Ho_Chi_Minh", "currency": "VND", "ownerId": "…",
  "members": [ /* User */ ],
  "days": [ { "date": "2026-12-05", "index": 1 } ],
  "totalSpent": 240000 }           // chỉ có ở GET /trips/:tripId

// Cluster
{ "id": "…", "tripId": "…", "name": "Ăn sáng", "type": "breakfast",
  "startTime": "06:00", "endTime": "09:00", "order": 1, "placeCount": 3,
  // chỉ có khi truy vấn kèm ?date=
  "state": "done",                 // done | current | upcoming
  // chỉ có khi kèm ?include=
  "places": [ /* TripPlace */ ], "checkins": [ /* Checkin */ ] }

// TripPlace  (không chứa dữ liệu Google ngoài placeId)
{ "id": "…", "tripId": "…", "clusterId": "…", "source": "link", "placeId": "ChIJ…",
  "label": "Bánh canh Hẻm", "lat": 11.9411, "lng": 108.4411, "mapsUrl": "https://maps.app.goo.gl/…",
  "note": "", "manualHours": { "open": "06:00", "close": "13:00" }, "manualPrice": null,
  "order": 1, "isArchived": false,
  // chỉ có khi kèm ?include=google
  "google": { /* GoogleData */ } , "googleError": null }

// GoogleData  (lấy từ Google mỗi lần, không lưu)
{ "placeId": "ChIJ…", "displayName": "Bánh canh Hẻm", "googleMapsUri": "https://maps.google.com/?cid=…",
  "businessStatus": "OPERATIONAL",
  "rating": 4.5, "userRatingCount": 812,
  "priceLevel": 2,                          // 0 = miễn phí … 4 = rất đắt, null nếu không có
  "priceRange": { "min": 30000, "max": 60000, "currency": "VND" },   // null nếu không có
  "hours": {
    "regular": [ { "day": 1, "open": "06:00", "close": "13:00" } ],  // day: 0 = Chủ nhật … 6 = Thứ bảy
    "today": { "date": "2026-12-05", "open": "06:00", "close": "13:00", "source": "current" },
    "openNow": true },
  "fetchedAt": "2026-12-05T03:20:00.000Z" }

// Checkin
{ "id": "…", "tripId": "…", "clusterId": "…", "tripPlaceId": "…", "placeLabel": "Bánh canh Hẻm",
  "userId": "…", "dayDate": "2026-12-05", "takenAt": "…", "lat": 11.94, "lng": 108.44,
  "momentId": "…" | null,
  "expenseReminder": { "skipCount": 0, "movedToBell": false },
  "expense": { /* Expense */ } | null }          // chỉ có khi kèm ?include=expense

// Expense
{ "checkinId": "…", "tripPlaceId": "…", "dayDate": "…",
  "amount": 85000, "note": "2 tô + trà đá", "enteredBy": "…", "updatedAt": "…" }

// Moment
{ "id": "…", "tripId": "…", "user": { "id": "…", "username": "tien" },
  "source": "checkin",             // checkin | camera | import
  "checkinId": null, "tripPlaceId": null,
  "photoUrl": "https://…", "thumbUrl": "https://…", "urlExpiresAt": "…", "width": 1080, "height": 1080,
  "note": "", "mood": "happy",     // happy | excited | relaxed | tired | sad | null
  "takenAt": "…", "dayDate": "…", "lat": null, "lng": null, "placeLabel": null,
  "isPrivate": false, "isHighlight": false }

// Notification
{ "id": "…", "tripId": "…",
  "type": "closing_soon",          // rain | closing_soon | closed_early | closed | expense_skipped
  "refId": "…", "payload": { "label": "Bánh canh Hẻm", "closesAt": "13:00", "minutesLeft": 25 },
  "dedupeKey": "closing_soon:<tripPlaceId>:2026-12-05", "readAt": null, "createdAt": "…" }
```

URL ảnh (`photoUrl`, `thumbUrl`) là signed URL có hạn khoảng 1 giờ. Hết hạn thì client tải lại tài nguyên để lấy URL mới. Check-in không còn `clientId` vì ID do client sinh.

## 4. Người dùng và phiên đăng nhập (FR-1)

| Route | Mô tả |
| --- | --- |
| `GET /usernames/:username` | Không cần đăng nhập. → `200 { "username": "tien", "available": false, "suggestions": ["tien1", "tien.gg", "tien_88"] }`. `suggestions` chỉ có khi `available = false`. Sai định dạng → `400` |
| `POST /users` | Đăng ký. Body `{ "username", "password" }` (username `^[a-z0-9_.]{3,20}$`, mật khẩu 8 đến 72 ký tự). → `201 { "user": User, "accessToken", "expiresIn": 900 }` + cookie `gg_rt` (đăng ký xong đăng nhập luôn). Lỗi: `409 USERNAME_TAKEN` (kèm `suggestions`) |
| `GET /users/me` | → `200 { "user": User }`. Trang Tài khoản hiện và sao chép `publicId` |
| `PUT /users/me/avatar` | `{ "image": "data:image/jpeg;base64,…" }` (tối đa 150.000 ký tự) → `200 { "user": User }`. Thêm hoặc đổi ảnh đại diện |
| `DELETE /users/me/avatar` | → `200 { "user": User }`. Gỡ ảnh đại diện |
| `POST /sessions` | Đăng nhập. Body như đăng ký. → `201 { user, accessToken, expiresIn }` + cookie. Lỗi: `401 INVALID_CREDENTIALS` (không nói sai ở tên hay mật khẩu) |
| `PUT /sessions/current` | Làm mới phiên (dùng cookie, không có body). → `200 { accessToken, expiresIn }` + cookie mới. Dùng lại token cũ thì thu hồi cả chuỗi. Lỗi: `401 REFRESH_INVALID` |
| `DELETE /sessions/current` | Đăng xuất. → `204`, xoá cookie, thu hồi chuỗi token |

## 5. Trip và thành viên (FR-2, FR-3, FR-4)

### `GET /trips`

Query: `status=ongoing|upcoming|finished` (tuỳ chọn), `sort=startDate|-startDate` (mặc định `-startDate`), `limit`.
→ `200 { "items": [TripSummary] }`. Client tự nhóm theo `status` cho danh sách (FR-4).
Chuyến mở Trip Mode (FR-12): `GET /trips?status=ongoing&sort=startDate&limit=1`.

### `POST /trips`

Body: `{ "name", "destination", "startDate", "endDate", "tz"?, "destinationGeo"? }`. `endDate >= startDate`, tối đa 30 ngày.
→ `201 { "trip": Trip }`, header `Location: /api/trips/<id>`. Server tạo luôn 4 cụm mặc định.

### `GET /trips/:tripId` → `200 { "trip": Trip }` (có `days`, `members`, `totalSpent`).

### `PATCH /trips/:tripId`

Body (trường nào đổi gửi trường đó): `name`, `destination`, `destinationGeo`, `startDate`, `endDate`, `tz`, `coverMomentId`, `confirmShrink`.
→ `200 { "trip": Trip }`.
Rút ngắn ngày mà ngày bị bỏ **đang có dữ liệu** và chưa có `confirmShrink: true`:

```json
409 { "error": { "code": "DAYS_HAVE_DATA", "message": "Bỏ ngày này sẽ ẩn dữ liệu đã có.",
  "details": { "removedDays": ["2026-12-07"], "counts": { "checkins": 3, "moments": 8, "expenses": 3 } } } }
```

Gửi lại kèm `confirmShrink: true` thì lưu. Dữ liệu của ngày bị bỏ **không bị xoá**, chỉ ẩn, hiện lại nếu nới ngày.

### `DELETE /trips/:tripId?confirmName=<tên chuyến, mã hoá URL>` · chỉ chủ chuyến

→ `204`. Lỗi: `400 CONFIRM_NAME_MISMATCH`, `403 FORBIDDEN`. Xoá cả ảnh trong Supabase.

### Thành viên

| Route | Mô tả |
| --- | --- |
| `POST /trips/:tripId/members` | Body `{ "identifier": "tien" }` (tên đăng nhập hoặc `publicId`). Thêm thẳng vào chuyến. → `201 { "member": User }`. Lỗi: `404 USER_NOT_FOUND`, `409 ALREADY_MEMBER` |
| `DELETE /trips/:tripId/members/:userId` | → `204`. Chủ chuyến xoá được người khác, thành viên tự rời được. Chủ chuyến không rời được: `403 OWNER_CANNOT_LEAVE` |

## 6. Cụm (FR-5, FR-13)

### `GET /trips/:tripId/clusters`

Query: `date=2026-12-05` (tuỳ chọn), `include=places,checkins` (tuỳ chọn).
→ `200 { "items": [Cluster] }` sắp theo `order`.

- Có `date`: mỗi cụm có thêm `state`. `done` nếu cụm có check-in trong ngày đó. `current` là cụm chưa xong có khoảng giờ chứa giờ hiện tại theo múi giờ chuyến, nếu không có thì là cụm chưa xong sắp tới gần nhất. Còn lại là `upcoming`. Ngày ngoài chuyến → `422 DATE_OUT_OF_RANGE`.
- `include=places`: nhúng quán chưa archive (không có dữ liệu Google). `include=checkins` (cần `date`): nhúng check-in của cụm trong ngày đó.

### Các route khác

| Route | Mô tả |
| --- | --- |
| `POST /trips/:tripId/clusters` | Body `{ name, startTime, endTime }` → `201 { cluster }` (`type: "custom"`) |
| `GET /trips/:tripId/clusters/:clusterId` | → `200 { cluster }` |
| `PATCH /trips/:tripId/clusters/:clusterId` | Body `{ name?, startTime?, endTime?, order? }` → `200 { cluster }`. Sửa được tên và giờ của mọi cụm |
| `DELETE /trips/:tripId/clusters/:clusterId` | → `204`. Chỉ cụm `custom`: `409 CLUSTER_PROTECTED` với cụm mặc định, `409 CLUSTER_NOT_EMPTY` nếu còn quán |

## 7. Quán (FR-6, FR-10, FR-11, FR-17)

### Bước 1, dán link: `GET /trips/:tripId/place-candidate?url=<link mã hoá URL>`

Tra cứu chỉ đọc: đổi link thành quán và lấy dữ liệu Google để xem trước. **Không lưu gì.**
→ `200`:

```json
{ "candidate": { "source": "link", "placeId": "ChIJ…", "label": "Bánh canh Hẻm",
                 "lat": 11.9411, "lng": 108.4411, "mapsUrl": "https://maps.app.goo.gl/…",
                 "matchedBy": "resolution_api" },
  "google": { /* GoogleData */ },
  "googleError": null }
```

- `matchedBy`: `resolution_api`, hoặc `text_search` khi dùng cách dự phòng (cần bắt người dùng xác nhận).
- `label` mặc định là tên Google nếu có, không thì tên đọc từ URL.
- Không lấy được dữ liệu Google (hết cap hoặc lỗi): vẫn trả `candidate`, đặt `google: null` và `googleError` là `PLACES_QUOTA_EXCEEDED` hoặc `PLACES_UPSTREAM_ERROR`. Người dùng vẫn thêm được quán và nhập giờ, giá tay.
- Lỗi: `400 INVALID_MAPS_URL`, `422 PLACE_NOT_RESOLVED` (`details.reason`: `not_single_place`, `no_coordinates`, `not_found`), `429`.
- Server chỉ chấp nhận host `maps.app.goo.gl`, `goo.gl`, `google.com/maps`, `maps.google.com`.

### Bước 2, lưu vào cụm: `POST /trips/:tripId/places`

Body: `{ "source": "link" | "manual", "clusterId"?, "placeId"?, "label", "lat", "lng", "mapsUrl"?, "note"?, "manualHours"?, "manualPrice"? }`
→ `201 { "place": TripPlace }`, header `Location`.

- Không gửi `clusterId` ("+ Quán khác", FR-17): server xếp vào cụm có khoảng giờ chứa giờ hiện tại theo múi giờ chuyến, không có thì vào cụm "Đi chơi". Đổi cụm sau bằng `PATCH`.
- `source: "manual"` không cần `placeId`.
- Lỗi: `409 PLACE_ALREADY_IN_CLUSTER` (`details.existingPlaceId`).

### Các route còn lại

| Route | Mô tả |
| --- | --- |
| `GET /trips/:tripId/places` | Query: `clusterId`, `include=google`. → `200 { "items": [TripPlace] }` bỏ quán đã archive. Dùng cho bản đồ (FR-11), client tô màu pin theo `clusterId`. Có `include=google`: mỗi quán nhúng `google` và `googleError`, **tối đa 10 quán**, hơn thì `422 TOO_MANY_PLACES`. Mỗi quán tính một lượt Place Details vào cap |
| `GET /trips/:tripId/places/:tripPlaceId` | → `200 { place }` |
| `GET /trips/:tripId/places/:tripPlaceId/google-data` | → `200 GoogleData` (`no-store`). Lỗi: `409 NO_GOOGLE_PLACE`, `503 PLACES_QUOTA_EXCEEDED`, `502 PLACES_UPSTREAM_ERROR` |
| `PATCH /trips/:tripId/places/:tripPlaceId` | Body `{ label?, note?, clusterId?, manualHours?, manualPrice?, order? }` → `200 { place }` |
| `DELETE /trips/:tripId/places/:tripPlaceId` | → `204`. Quán đã có check-in thì được archive thay vì xoá |

Dữ liệu Google chỉ lấy được cho **quán đã lưu trong chuyến**, không phải proxy mở cho `placeId` bất kỳ. Client giữ kết quả trong bộ nhớ trình duyệt của phiên, không ghi vào IndexedDB hay localStorage. Khi hiển thị cần ghi nguồn Google.

## 8. Check-in và chi tiêu (FR-15, FR-16, FR-22)

### `PUT /trips/:tripId/checkins/:checkinId` · chụp xong là check-in xong

`checkinId` do client sinh. Body:

```json
{ "tripPlaceId": "…", "takenAt": "2026-12-05T01:05:00.000Z", "lat": 11.94, "lng": 108.44,
  "momentId": "…", "photo": { "width": 1080, "height": 1080, "bytes": 412330 } }
```

`momentId` và `photo` đi cùng nhau, bỏ cả hai khi check-in không ảnh. ID ảnh do client sinh, ảnh đã tải lên theo mục 9.
→ `201 { "checkin": Checkin, "moment": Moment | null }` (lần đầu), `200` nếu gửi lại cùng ID.

- Có ảnh thì server tạo một `moment` nguồn `checkin` để ảnh vào album chung.
- `dayDate` do server tính từ `takenAt` và múi giờ chuyến.
- Quán đã có check-in trong ngày đó (do ID khác): `409 ALREADY_CHECKED_IN` kèm `details.checkinId`. Client coi như người này cùng tham gia, nếu có ảnh thì tạo khoảnh khắc `camera` kèm `checkinId` đó qua mục 9.
- Lỗi khác: `404 PLACE_NOT_FOUND`, `409 ID_CONFLICT`, `422 DATE_OUT_OF_RANGE`, `422 PHOTO_NOT_FOUND`.

### `GET /trips/:tripId/checkins`

Query: `date`, `expenseStatus=missing|entered`, `reminder=active` (chưa chuyển vào chuông), `include=expense`, `sort=-takenAt`, `limit`.
→ `200 { "items": [Checkin] }`.
Khung nhắc nhập tiền ở Trip Mode (FR-16): `?expenseStatus=missing&reminder=active&sort=-takenAt&limit=1`.

### `GET /trips/:tripId/checkins/:checkinId` → `200 { checkin }`

### `PATCH /trips/:tripId/checkins/:checkinId` · bấm "Bỏ qua" nhắc tiền

Body: `{ "expenseReminder": { "skipCount": 2 } }` → `200 { checkin }`.

- Client gửi **giá trị tuyệt đối** của số lần bỏ qua, nên gửi lại khi offline không làm đếm dư. Server lấy giá trị lớn hơn giữa bản đang có và bản gửi lên.
- Từ 2 trở lên: `movedToBell = true`, server tạo một thông báo `expense_skipped` (một lần duy nhất).
- `movedToBell` chỉ đọc.

### Khoản chi của check-in (singleton)

| Route | Mô tả |
| --- | --- |
| `PUT /trips/:tripId/checkins/:checkinId/expense` | Body `{ "amount": 85000, "note"?: "…" }`. Nhập mới → `201 { expense }`, sửa → `200`. Dùng cho cả nhập bù ở trang Chi tiêu (FR-22). Lỗi: `404 CHECKIN_NOT_FOUND`, `400 VALIDATION_ERROR` (`amount` là số nguyên 0 đến 1.000.000.000) |
| `GET /trips/:tripId/checkins/:checkinId/expense` | → `200 { expense }` hoặc `404 EXPENSE_NOT_FOUND` |
| `DELETE /trips/:tripId/checkins/:checkinId/expense` | → `204` |

### `GET /trips/:tripId/expenses?groupBy=day|place` · tổng hợp chi tiêu

`groupBy=day` (mặc định):

```json
{ "total": 240000,
  "days": [ { "date": "2026-12-05", "total": 240000,
    "items": [ { "checkinId": "…", "tripPlaceId": "…", "placeLabel": "Bánh canh Hẻm",
                 "amount": 85000, "note": "" },
               { "checkinId": "…", "placeLabel": "Cà phê Mê Linh", "amount": null, "note": null } ] } ] }
```

`amount: null` nghĩa là chưa nhập, client hiện nhãn "Chưa nhập". `groupBy=place` → `{ "total", "places": [ { "tripPlaceId", "placeLabel", "total", "visits": [ { "date", "checkinId", "amount" } ] } ] }`.

Chưa có route xoá check-in vì PRD chưa yêu cầu.

## 9. Ảnh và khoảnh khắc (FR-15, FR-20, FR-21, FR-28)

### `POST /trips/:tripId/uploads` · xin chỗ tải ảnh

Body: `{ "momentIds": ["…", "…"], "contentType": "image/jpeg" }` (1 đến 20 ID do client sinh; `image/jpeg` hoặc `image/webp`)
→ `201`:

```json
{ "items": [ { "momentId": "…", "photo": { "uploadUrl": "https://…" }, "thumb": { "uploadUrl": "https://…" } } ],
  "expiresAt": "…" }
```

Đường dẫn lưu trữ do server suy ra từ `tripId` và `momentId` (`trips/<tripId>/moments/<momentId>.jpg` và `.thumb.jpg`), client không gửi đường dẫn. Client nén ảnh (đề xuất dưới khoảng 2 MB mỗi ảnh, thumbnail dưới khoảng 200 KB), tải thẳng lên `uploadUrl` theo cách của Supabase signed upload URL (kiểm tra method và header khi code), rồi tạo bản ghi bằng `PUT` bên dưới.

### `PUT /trips/:tripId/moments/:momentId` · tạo khoảnh khắc

`momentId` do client sinh, ảnh đã tải lên. Body:

```json
{ "source": "camera", "photo": { "width": 1080, "height": 1080, "bytes": 412330 },
  "takenAt": "…", "note"?: "…", "mood"?: "happy", "lat"?: 11.94, "lng"?: 108.44,
  "placeLabel"?: "…", "tripPlaceId"?: "…", "checkinId"?: "…" }
```

`source` là `camera` hoặc `import`. Nguồn `checkin` chỉ do route check-in tạo. → `201 { "moment": Moment }`, gửi lại cùng ID thì `200` bản hiện có. `dayDate` do server tính. Nhập nhiều ảnh (FR-21): client tải ảnh lên rồi `PUT` từng ảnh, `takenAt` lấy từ EXIF. Lỗi: `409 ID_CONFLICT`, `422 PHOTO_NOT_FOUND`, `422 DATE_OUT_OF_RANGE`.

### Các route khác

| Route | Mô tả |
| --- | --- |
| `GET /trips/:tripId/moments` | Query `date`, `userId`, `limit=30`, `cursor`. → `200 { "items": [Moment], "nextCursor": … }` sắp theo `takenAt` giảm dần. Dùng cho album chung (FR-28) và lưới recap (FR-29). Thành viên thấy cả khoảnh khắc `isPrivate` |
| `GET /trips/:tripId/moments/:momentId` | → `200 { moment }` |
| `PATCH /trips/:tripId/moments/:momentId` | Body `{ note?, mood?, takenAt?, lat?, lng?, placeLabel?, isPrivate?, isHighlight? }` → `200 { moment }`. Đổi `takenAt` thì tính lại `dayDate`. Đặt `isHighlight: true` thì ảnh nổi bật cũ của ngày đó tự bỏ đánh dấu. Mọi thành viên sửa được |
| `DELETE /trips/:tripId/moments/:momentId` | → `204`. Tác giả hoặc chủ chuyến. Xoá cả file ảnh và thumbnail |

## 10. Recap và chia sẻ (FR-23 đến FR-25, FR-29)

| Route | Mô tả |
| --- | --- |
| `GET /trips/:tripId/recap` | Recap chuyến (FR-24) |
| `GET /trips/:tripId/recap/days/:date` | Recap ngày (FR-23) |

`GET /trips/:tripId/recap` → `200`:

```json
{ "stats": { "dayCount": 3, "visitedCount": 9, "momentCount": 42, "totalSpent": 1240000 },
  "route": [ { "checkinId": "…", "label": "…", "lat": 11.94, "lng": 108.44, "takenAt": "…", "dayDate": "…" } ],
  "days": [ { "date": "2026-12-05", "index": 1, "visitedCount": 3, "totalSpent": 240000,
              "highlight": Moment | null } ],
  "cover": Moment | null }
```

`GET /trips/:tripId/recap/days/:date` → `200`:

```json
{ "date": "2026-12-05", "index": 1, "totalSpent": 240000,
  "visits": [ { "checkinId": "…", "time": "08:05", "clusterName": "Ăn sáng", "label": "…",
                "lat": 11.94, "lng": 108.44, "amount": 85000, "moment": Moment | null } ],
  "moments": [Moment] }
```

Chọn ảnh bìa: `PATCH /trips/:tripId` với `coverMomentId`. Ẩn khoảnh khắc riêng tư: `PATCH` moment với `isPrivate`. Xuất ảnh vuông (FR-29) làm ở client từ dữ liệu hai route trên.

### Chia sẻ bằng link chỉ xem (singleton `share`)

| Route | Mô tả |
| --- | --- |
| `PUT /trips/:tripId/share` | Body `{ "includeExpenses"?: false }`. Chưa có thì tạo và sinh token → `201 { "share": { "token", "url", "includeExpenses" } }`. Đã có thì giữ token, cập nhật `includeExpenses` → `200` |
| `GET /trips/:tripId/share` | → `200 { share }` hoặc `404 SHARE_NOT_FOUND` |
| `DELETE /trips/:tripId/share` | → `204`, thu hồi link ngay |
| `GET /share/:token` | **Không cần đăng nhập**, giới hạn tốc độ theo IP |

`GET /share/:token` → `200`:

```json
{ "trip": { "name": "…", "destination": "…", "startDate": "…", "endDate": "…" },
  "stats": { "dayCount": 3, "visitedCount": 9, "momentCount": 40, "totalSpent": 1240000 },
  "route": [ { "label": "…", "lat": 11.94, "lng": 108.44, "takenAt": "…" } ],
  "days": [ { "date": "…", "index": 1, "highlight": { "photoUrl": "…", "thumbUrl": "…" },
              "moments": [ { "photoUrl": "…", "thumbUrl": "…", "note": "…", "takenAt": "…", "placeLabel": "…" } ] } ],
  "cover": { "photoUrl": "…" } | null }
```

- Không trả khoảnh khắc `isPrivate`, không trả thông tin người đăng.
- `totalSpent` chỉ có khi `includeExpenses = true`.
- Chỉ dùng `label` đã lưu, **tuyệt đối không gọi Google**.
- Lỗi: `404 SHARE_NOT_FOUND` (token sai hoặc đã thu hồi).

## 11. Thông báo và thời tiết (FR-26, FR-27)

| Route | Mô tả |
| --- | --- |
| `GET /trips/:tripId/notifications` | Query `unread=true`, `limit=50`. → `200 { "items": [Notification], "unreadCount": 3 }`. Dùng cho chuông |
| `POST /trips/:tripId/notifications` | Client chỉ tạo loại `rain`, `closing_soon`, `closed_early`, `closed`. Body `{ "type", "refId"?, "dedupeKey", "payload" }` → `201 { notification }`, hoặc `200` bản đã có nếu `dedupeKey` trùng (tạo idempotent) |
| `PATCH /trips/:tripId/notifications/:notificationId` | Body `{ "read": true }` → `200 { notification }` |
| `PATCH /trips/:tripId/notifications?unread=true` | Đánh dấu đã đọc hàng loạt. Body `{ "read": true }` → `204` |

Loại `expense_skipped` do server tạo khi `PATCH` check-in (mục 8). Quy ước `dedupeKey`: `closing_soon:<tripPlaceId>:<YYYY-MM-DD>` và `rain:<tripId>:<YYYY-MM-DD>`. Thông báo "sắp đóng" do client tính từ giờ lấy được từ Google hoặc `manualHours`, ngưỡng đề xuất còn 30 phút.

### `GET /trips/:tripId/weather`

```json
{ "days": [ { "date": "2026-12-05", "available": true, "tempMin": 14, "tempMax": 24,
              "precipitationProbabilityMax": 70, "precipitationSum": 6.2, "rain": true } ],
  "rainAdvice": "Nên chọn những quán có mái hiên." }
```

- `GET` này **không tạo thông báo**. Client thấy `rain: true` thì tự `POST` thông báo `rain` cho mình.
- `rain` do server quyết định, ngưỡng đề xuất là xác suất mưa tối đa từ 60% trở lên.
- `rainAdvice` có khi ít nhất một ngày có mưa, ngược lại `null`. Server **không sắp xếp lại quán**.
- Open-Meteo chỉ dự báo trước một khoảng ngày giới hạn (cần kiểm tra con số cụ thể), ngày xa hơn trả `available: false`.

## 12. Ghép màn hình Trip Mode từ các route REST

Không còn route tổng hợp riêng. Mở Trip Mode gửi các request sau **song song**:

| Cần hiển thị | Request |
| --- | --- |
| Tên chuyến, ngày thứ mấy, Tổng chi tiêu (FR-13) | `GET /trips/:tripId` |
| Thanh tiến trình cụm, thẻ quán của cụm | `GET /trips/:tripId/clusters?date=<hôm nay>&include=places,checkins` |
| Rating, giá, giờ của cụm đang tới (FR-14) | `GET /trips/:tripId/places?clusterId=<cụm đang tới>&include=google` |
| Khung nhắc nhập tiền (FR-16) | `GET /trips/:tripId/checkins?expenseStatus=missing&reminder=active&sort=-takenAt&limit=1` |
| Chấm đỏ trên chuông (FR-26) | `GET /trips/:tripId/notifications?unread=true&limit=1` (`unreadCount`) |
| Ô ảnh nhỏ album (FR-28) | `GET /trips/:tripId/moments?limit=1` |

Chỉ request thứ ba chạm Google và tính vào cap. Các request còn lại là dữ liệu của app, có thể giữ trong bộ nhớ phiên hoặc IndexedDB cho offline.

## 13. Khác

`GET /health` → `200 { "status": "ok" }` (không cần đăng nhập), dùng cho giám sát và giữ server không ngủ.

## 14. Giới hạn tốc độ

| Nhóm route | Giới hạn (đề xuất) | Theo |
| --- | --- | --- |
| `POST /users`, `POST /sessions` | 10 lần / 15 phút | IP |
| `GET /usernames/:username` | 30 lần / phút | IP |
| `GET /share/:token` | 60 lần / phút | IP |
| `place-candidate`, `google-data`, `places?include=google` (gọi Google) | 30 lần / phút | Người dùng |
| Các route còn lại | 120 lần / phút | Người dùng |

Ngoài ra tổng lượt Place Details còn bị chặn bởi cap theo ngày trên Google Cloud (xem Tech Spec mục 12).

## 15. FR → route

| FR | Route chính |
| --- | --- |
| FR-1 | `GET /usernames/:u`, `POST /users`, `POST /sessions`, `PUT/DELETE /sessions/current`, `GET /users/me` |
| FR-2 | `POST/PATCH/DELETE /trips` |
| FR-3 | `POST/DELETE /trips/:id/members` |
| FR-4 | `GET /trips?status=`, `Trip.days` |
| FR-5 | `clusters` |
| FR-6, FR-17 | `place-candidate`, `POST places` |
| FR-10, FR-14 | `google-data`, `places?include=google` |
| FR-11 | `GET places` |
| FR-12, FR-13 | Mục 12 |
| FR-15 | `PUT checkins/:id`, `POST uploads` |
| FR-16 | `PUT checkins/:id/expense`, `PATCH checkins/:id` |
| FR-18 | ID do client sinh + `PUT` idempotent (mục 1) |
| FR-20, FR-21, FR-28 | `POST uploads`, `PUT moments/:id`, `GET moments` |
| FR-22 | `GET expenses`, `PUT checkins/:id/expense` |
| FR-23, FR-24 | `recap`, `recap/days/:date` |
| FR-25 | `PATCH trip.coverMomentId`, `PATCH moment.isPrivate`, `share` |
| FR-26 | `notifications` |
| FR-27 | `weather` |
| FR-29 | `GET moments`, xuất ảnh ở client |

## 16. Thay đổi so với v0.1 và tác động lên doc khác

| v0.1 | v0.2 | Lý do |
| --- | --- | --- |
| `GET /trips` trả `groups` + `currentTripId` | `GET /trips?status=` trả danh sách phẳng | Lọc bằng query |
| `GET /users/check-username`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | `GET /usernames/:u`, `POST /users`, `POST /sessions`, `PUT /sessions/current`, `DELETE /sessions/current` | Tài nguyên người dùng và phiên |
| `DELETE /trips/:id` có body | `DELETE …?confirmName=` | `DELETE` không có body |
| `/clusters/:id`, `/places/:id`, `/moments/:id`, `/expenses/:id` (nông) | Luôn nằm dưới `/trips/:tripId/…` | Nhất quán, kiểm tra quyền từ đường dẫn |
| `POST places/resolve` | `GET place-candidate?url=` | Tra cứu chỉ đọc |
| `GET places/:id/live`, `POST places/live` | `GET places/:id/google-data`, `GET places?include=google` | Tài nguyên con và mở rộng bằng query |
| `GET trip-mode` (tổng hợp) | Bỏ, ghép từ route REST (mục 12) | Đúng tài nguyên |
| `POST checkins` với `clientId` | `PUT checkins/:checkinId`, ID do client sinh | Idempotent tự nhiên, không cần ánh xạ ID |
| `PUT expenses` kèm `checkinId` hoặc `checkinClientId` | `PUT checkins/:id/expense` | Singleton của check-in |
| `POST expense-skips` | `PATCH checkins/:id` với `skipCount` tuyệt đối | Idempotent, không đếm dư khi gửi lại |
| `POST moments`, `POST moments/bulk` | `PUT moments/:id`, bỏ bulk | Idempotent, nhập nhiều ảnh bằng nhiều `PUT` |
| `POST uploads/sign` trả đường dẫn | `POST uploads` nhận `momentIds`, đường dẫn do server suy ra | Client không quyết định đường dẫn lưu trữ |
| `POST/DELETE share` | `PUT/GET/DELETE share` | Singleton |
| `GET notifications?tripId=`, `POST notifications/:id/read`, `read-all` | `GET/POST/PATCH /trips/:tripId/notifications…` | Dưới trip, dùng `PATCH` |
| `GET weather` tạo thông báo `rain` ở server | `GET` thuần đọc, client tự tạo thông báo `rain` | `GET` không có tác dụng phụ |

**Tác động lên Database Design v0.1:** bỏ trường `clientId` và ba index unique `clientId` (checkins, moments), vì `_id` giờ do client sinh và được server chấp nhận nếu đúng định dạng 24 hex. Thông báo `rain` do client tạo. `expenseReminder.skipCount` là giá trị tuyệt đối. Check-in thứ hai trong cùng ngày cho cùng quán nhận `409` thay vì trả check-in cũ.
**Tác động lên Tech Spec v0.1:** mục 8 (danh sách API) và mục 9 (offline: bỏ `clientId`, dùng ID sinh sẵn).

## 17. Ghi chú và câu hỏi mở

- Giá trị đề xuất cần mày duyệt: giờ mặc định 4 cụm, danh sách `mood`, ngưỡng "sắp đóng" 30 phút, ngưỡng "có mưa" 60%, refresh token 30 ngày, tối đa 30 ngày mỗi chuyến.
- ID do client sinh dùng 12 byte ngẫu nhiên đổi sang hex (khớp định dạng ObjectId). Server vẫn kiểm tra ID không trùng với tài nguyên nào khác.
- `isPrivate` được hiểu là ẩn khỏi link chia sẻ, thành viên vẫn thấy.
- Link chia sẻ mặc định **không** hiện tổng chi tiêu.
- Chưa có chia tiền giữa thành viên và chưa có bước chấp nhận lời mời (câu "Cần chốt" của PRD v0.2).
- Mở Trip Mode tốn khoảng 6 request song song. Nếu thấy chậm trên mạng yếu thì cân nhắc thêm lại một route tổng hợp, nhưng bản này ưu tiên REST thuần.
