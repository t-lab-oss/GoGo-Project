# Go!Go! – Database Design (v0.2) · MongoDB

*23/11/2026 · Đi cùng Product Requirements v0.2 và API Contract v0.2. v0.2 đã chỉnh theo API Contract mục 16: bỏ `clientId` (ID do client sinh), `skipCount` tuyệt đối, thông báo `rain` do client tạo.*

## 1. Nguyên tắc thiết kế

| Chủ đề | Quy ước |
| --- | --- |
| Khoá chính | `_id` kiểu `ObjectId`. Trong API trả về dạng chuỗi hex |
| Thời điểm | Kiểu `Date` (UTC). Mọi bản ghi có `createdAt`, `updatedAt` (Mongoose `timestamps`) |
| Ngày không giờ | Chuỗi `"YYYY-MM-DD"` theo múi giờ của Trip (`trips.tz`). Dùng cho `startDate`, `endDate`, `dayDate` để tránh lệch múi giờ |
| Giờ trong ngày | Chuỗi `"HH:mm"` (24 giờ), theo múi giờ của Trip |
| Tiền | Số nguyên (VND, không có số lẻ). Đơn vị tiền nằm ở `trips.currency` |
| ID do client sinh | Check-in và khoảnh khắc: client sinh `_id` (12 byte ngẫu nhiên, 24 hex) rồi `PUT`. Server chấp nhận nếu đúng định dạng và chưa thuộc tài nguyên khác (`ID_CONFLICT`). `_id` unique sẵn nên gửi lại là idempotent, không cần `clientId` |
| Phạm vi truy vấn | Mọi collection con đều có `tripId`. Quyền truy cập kiểm tra bằng `trips.memberIds` |
| Quan hệ | Tham chiếu bằng `ObjectId`. Chỉ nhúng (embed) khi dữ liệu nhỏ và luôn đọc cùng nhau |
| Dữ liệu Google | **Chỉ lưu `placeId`.** Rating, giờ, mức giá, tên do Google trả về không lưu ở bất kỳ collection nào (xem Tech Spec mục 6 và 12) |
| Xoá | Xoá cứng, có xoá dây chuyền ở tầng service (mục 7). Riêng quán đã có check-in thì **lưu trữ (archive)** thay vì xoá |

## 2. Sơ đồ quan hệ

```
users ──< refreshTokens
  │
  └──(memberIds, ownerId)── trips ──< clusters ──< tripPlaces
                              │                        │
                              │                        └──< checkins ──1:1── expenses
                              │                               │
                              ├──< moments ───(checkinId)─────┘
                              └──< notifications (theo userId)
```

- Một Trip có nhiều cụm. Cụm thuộc Trip, dùng chung cho mọi ngày của chuyến.
- Quán (`tripPlaces`) thuộc đúng một cụm. Cùng một quán Google có thể xuất hiện ở nhiều cụm hoặc nhiều Trip thành các bản ghi riêng.
- **"Đã chọn" không lưu trên quán.** Trạng thái này suy ra từ `checkins` theo từng ngày: cụm A của ngày D hoàn thành nếu có check-in với `clusterId = A` và `dayDate = D`.
- Mỗi check-in có tối đa một khoản chi (`expenses`), và tối đa một ảnh (`moments`, nguồn `checkin`).

## 3. Collections

### 3.1 `users` (FR-1)

| Trường | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| `_id` | ObjectId | |
| `username` | string | Chữ thường, `^[a-z0-9_.]{3,20}$`, **unique**. Báo trùng ngay khi gõ |
| `passwordHash` | string | bcrypt (bcryptjs, 10 vòng) |
| `publicId` | string | ID riêng hiện sau đăng ký, ví dụ `GG-7K3F9Q`. **Unique**. Chữ cái in hoa và số, bỏ các ký tự dễ nhầm (0, O, 1, I, L) |
| `lastLoginAt` | Date? | |
| `createdAt`, `updatedAt` | Date | |

```json
{ "_id": "6561f0c2a1b2c3d4e5f60001", "username": "tien", "passwordHash": "$argon2id$…",
  "publicId": "GG-7K3F9Q", "createdAt": "2026-11-23T15:13:14.231Z" }
```

### 3.2 `refreshTokens`

Dùng để xoay refresh token (mỗi lần refresh thì cấp token mới và vô hiệu token cũ) và phát hiện dùng lại token đã bị thay.

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `userId` | ObjectId | |
| `tokenHash` | string | SHA-256 của refresh token. **Không lưu token gốc** |
| `family` | string | UUID chung cho chuỗi token xoay từ một lần đăng nhập. Phát hiện dùng lại token cũ thì thu hồi cả family |
| `expiresAt` | Date | **TTL index**, hết hạn thì MongoDB tự xoá |
| `revokedAt` | Date? | |
| `replacedByTokenId` | ObjectId? | |
| `userAgent` | string? | |
| `createdAt` | Date | |

### 3.3 `trips` (FR-2, FR-3, FR-4, FR-25)

| Trường | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| `name` | string | 1 đến 80 ký tự |
| `destination` | string | 1 đến 80 ký tự |
| `destinationGeo` | `{lat, lng}`? | Toạ độ điểm đến để gọi thời tiết. Có thể trống thì lấy trung bình toạ độ các quán |
| `startDate`, `endDate` | string | `"YYYY-MM-DD"`, `endDate >= startDate`, tối đa 30 ngày (đề xuất) |
| `tz` | string | IANA, mặc định `Asia/Ho_Chi_Minh` |
| `currency` | string | Mặc định `VND` |
| `ownerId` | ObjectId | Người tạo chuyến |
| `memberIds` | ObjectId[] | Gồm cả owner. Thêm trực tiếp, chưa có bước chấp nhận (xem mục 10) |
| `coverMomentId` | ObjectId? | Ảnh bìa (FR-25) |
| `share` | object? | `{ token, includeExpenses, createdAt }`; `null` nghĩa là chưa chia sẻ. `token` là `nanoid` dài, **unique** khi có |

- **Ngày của chuyến không lưu.** Danh sách ngày sinh từ `startDate` đến `endDate`.
- **Trạng thái** Sắp đi / Đang đi / Đã xong tính từ ngày hôm nay (theo `tz`) so với khoảng ngày, không lưu.

```json
{ "_id": "6561f1d0a1b2c3d4e5f60101", "name": "Đà Lạt 3N2Đ", "destination": "Đà Lạt",
  "destinationGeo": { "lat": 11.9404, "lng": 108.4583 },
  "startDate": "2026-12-05", "endDate": "2026-12-07", "tz": "Asia/Ho_Chi_Minh", "currency": "VND",
  "ownerId": "6561f0c2a1b2c3d4e5f60001",
  "memberIds": ["6561f0c2a1b2c3d4e5f60001", "6561f0c2a1b2c3d4e5f60002"],
  "coverMomentId": null, "share": null }
```

### 3.4 `clusters` (FR-5)

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `tripId` | ObjectId | |
| `name` | string | 1 đến 40 ký tự |
| `type` | string | `breakfast`, `lunch`, `dinner`, `activity`, `custom` |
| `startTime`, `endTime` | string | `"HH:mm"` |
| `order` | int | Thứ tự hiển thị |

Khi tạo Trip, server tạo sẵn 4 cụm (giờ mặc định là đề xuất, chỉnh được): Ăn sáng 06:00–09:00, Ăn trưa 11:00–14:00, Ăn tối 17:00–21:00, Đi chơi 09:00–17:00. Không có bật/tắt cụm.

### 3.5 `tripPlaces` (FR-6, FR-10, FR-11, FR-17)

| Trường | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| `tripId`, `clusterId` | ObjectId | |
| `source` | string | `link` (dán link) hoặc `manual` (thêm tay) |
| `placeId` | string? | Google place ID. `null` khi `source = manual` |
| `label` | string | Tên hiển thị do người dùng xác nhận. Dùng cho recap và link chia sẻ |
| `lat`, `lng` | number | Từ link người dùng dán, hoặc do ghim tay |
| `mapsUrl` | string? | Link Google Maps gốc, dùng cho nút "Chỉ đường" |
| `note` | string | Ghi chú, tối đa 500 ký tự |
| `manualHours` | `{open, close}`? | Giờ mở đóng cửa do người dùng nhập, áp dụng mỗi ngày. Dự phòng khi không có dữ liệu Google |
| `manualPrice` | string? | Mức giá do người dùng nhập, tối đa 40 ký tự |
| `order` | int | Thứ tự trong cụm |
| `addedBy` | ObjectId | |
| `isArchived`, `archivedAt` | bool, Date? | Quán đã có check-in mà bị xoá thì archive: ẩn khỏi cụm nhưng recap vẫn dùng |

- Không có `status` hay `chosenAt`. "Đã chọn" suy ra từ `checkins`.
- Không trùng cùng `placeId` trong cùng cụm (index unique có điều kiện, mục 4).

```json
{ "_id": "6561f2a0a1b2c3d4e5f60201", "tripId": "6561f1d0a1b2c3d4e5f60101",
  "clusterId": "6561f1d0a1b2c3d4e5f60111", "source": "link",
  "placeId": "ChIJ…", "label": "Bánh canh Hẻm", "lat": 11.9411, "lng": 108.4411,
  "mapsUrl": "https://maps.app.goo.gl/…", "note": "Quán nhỏ, đi sớm",
  "manualHours": null, "manualPrice": null, "order": 1,
  "addedBy": "6561f0c2a1b2c3d4e5f60001", "isArchived": false }
```

### 3.6 `checkins` (FR-15, FR-17)

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `tripId`, `clusterId`, `tripPlaceId` | ObjectId | |
| `placeLabel` | string | Bản sao tên quán lúc check-in, phòng khi quán bị archive |
| `userId` | ObjectId | Người check-in |
| `dayDate` | string | `"YYYY-MM-DD"` theo `tz` của Trip. Server tính từ `takenAt` |
| `takenAt` | Date | |
| `lat`, `lng` | number? | Vị trí thiết bị lúc check-in (FR-15 lưu vị trí) |
| `momentId` | ObjectId? | Ảnh check-in. `null` khi check-in không ảnh |
| `expenseReminder` | `{skipCount, movedToBell}` | FR-16. `skipCount` là giá trị **tuyệt đối** client gửi, server lấy max(cũ, mới). Từ 2 trở lên thì `movedToBell = true` (chỉ đọc) |

- `_id` do client sinh (xem mục 1).
- Check-in nghĩa là quán thuộc cụm đã được chọn cho ngày đó, cụm hoàn thành.
- Nếu đã có check-in cho cùng `tripPlaceId` và `dayDate` do `_id` khác, server trả `409 ALREADY_CHECKED_IN` kèm `checkinId` (xem API Contract mục 8), không tạo mới.

### 3.7 `expenses` (FR-16, FR-22)

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `tripId`, `checkinId`, `tripPlaceId` | ObjectId | `checkinId` **unique**, mỗi check-in tối đa một khoản chi |
| `dayDate` | string | Lấy từ check-in |
| `amount` | int | `0` đến `1.000.000.000` |
| `note` | string? | Tối đa 200 ký tự |
| `enteredBy` | ObjectId | |

- Quán chưa có khoản chi hiện nhãn "Chưa nhập" (FR-22): check-in không có `expenses` tương ứng.
- Nhập bù hoặc sửa số tiền dùng cùng một lệnh ghi (upsert theo `checkinId`).
- Chưa có chia tiền giữa thành viên. Nếu sau này cần thì thêm `paidBy` và `splitAmong`.

### 3.8 `moments` (FR-15, FR-20, FR-21, FR-28)

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `tripId`, `userId` | ObjectId | |
| `source` | string | `checkin`, `camera` (nút Lưu khoảnh khắc), `import` (nhập từ thư viện) |
| `checkinId`, `tripPlaceId` | ObjectId? | |
| `photo` | object | `{ path, thumbPath, width, height, bytes }`, đường dẫn trong Supabase Storage. Ảnh vuông 1:1 |
| `note` | string? | Tối đa 500 ký tự |
| `mood` | string? | `happy`, `excited`, `relaxed`, `tired`, `sad` (danh sách đề xuất) |
| `takenAt` | Date | Giờ chụp. Với ảnh `import` lấy từ EXIF |
| `dayDate` | string | Tính từ `takenAt` theo `tz` |
| `lat`, `lng` | number? | Sửa tay được |
| `placeLabel` | string? | Địa điểm tự gắn, sửa tay được |
| `isPrivate` | bool | `true` thì **ẩn khỏi link chia sẻ** (FR-25). Thành viên vẫn thấy |
| `isHighlight` | bool | Ảnh nổi bật của ngày (FR-24). Tối đa một ảnh mỗi ngày, service tự đảm bảo |

- `_id` do client sinh (xem mục 1).

- Ảnh check-in được tạo thành một `moment` nguồn `checkin` để vào album chung, nên ảnh chỉ lưu một lần.

### 3.9 `notifications` (FR-26)

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `userId`, `tripId` | ObjectId | Mỗi người nhận một bản ghi riêng |
| `type` | string | `rain`, `closing_soon`, `closed_early`, `closed`, `expense_skipped` |
| `refId` | ObjectId? | `tripPlaceId` hoặc `checkinId` tuỳ loại |
| `payload` | object | Ví dụ `{ label, closesAt, minutesLeft }` |
| `dedupeKey` | string | Chống tạo trùng, ví dụ `closing_soon:<tripPlaceId>:2026-12-05`. **Unique theo (userId, dedupeKey)** |
| `readAt` | Date? | |

- Chỉ `expense_skipped` do server tạo (khi `PATCH` check-in). `rain`, `closing_soon`, `closed_early`, `closed` do client tạo qua `POST`: `rain` vì `GET weather` không có tác dụng phụ, các loại còn lại vì chỉ client có giờ mở cửa vừa lấy từ Google. `dedupeKey` unique làm cho `POST` idempotent.

### 3.10 `invitations` (tuỳ chọn, chỉ khi PRD chốt phải bấm chấp nhận)

`tripId`, `inviterId`, `inviteeId`, `status` (`pending`, `accepted`, `declined`), `createdAt`. Index `(inviteeId, status)`. **Chưa dùng ở v0.1.**

## 4. Index (chạy trong `mongosh`)

```js
// users, refreshTokens
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ publicId: 1 }, { unique: true })
db.refreshTokens.createIndex({ tokenHash: 1 }, { unique: true })
db.refreshTokens.createIndex({ userId: 1, family: 1 })
db.refreshTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// trips
db.trips.createIndex({ memberIds: 1, startDate: -1 })
db.trips.createIndex({ "share.token": 1 },
  { unique: true, partialFilterExpression: { "share.token": { $type: "string" } } })

// clusters, tripPlaces
db.clusters.createIndex({ tripId: 1, order: 1 })
db.tripPlaces.createIndex({ tripId: 1, clusterId: 1, order: 1 })
db.tripPlaces.createIndex({ tripId: 1, clusterId: 1, placeId: 1 },
  { unique: true, partialFilterExpression: { placeId: { $type: "string" }, isArchived: false } })

// checkins, expenses
db.checkins.createIndex({ tripId: 1, dayDate: 1, clusterId: 1 })
db.checkins.createIndex({ tripPlaceId: 1, dayDate: 1 })
db.expenses.createIndex({ checkinId: 1 }, { unique: true })
db.expenses.createIndex({ tripId: 1, dayDate: 1 })

// moments
db.moments.createIndex({ tripId: 1, takenAt: -1 })
db.moments.createIndex({ tripId: 1, dayDate: 1, isHighlight: 1 })

// notifications
db.notifications.createIndex({ userId: 1, tripId: 1, createdAt: -1 })
db.notifications.createIndex({ userId: 1, dedupeKey: 1 }, { unique: true })
```

Ghi chú: index unique có điều kiện dùng điều kiện so sánh bằng (`$type`, `isArchived: false`) vì partial index không hỗ trợ `$exists: false`. Vì vậy `isArchived` luôn được ghi là `false` thay vì bỏ trống.

## 5. Kiểm tra dữ liệu (validation)

Kiểm tra chính ở tầng ứng dụng bằng `zod` (request) và Mongoose schema. Có thể thêm `$jsonSchema` ở MongoDB làm lớp bảo vệ cuối cho các trường dễ hỏng. Ví dụ cho `expenses`:

```js
db.createCollection("expenses", { validator: { $jsonSchema: {
  bsonType: "object",
  required: ["tripId", "checkinId", "tripPlaceId", "dayDate", "amount", "enteredBy"],
  properties: {
    amount: { bsonType: ["int", "long"], minimum: 0, maximum: 1000000000 },
    dayDate: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    note: { bsonType: ["string", "null"], maxLength: 200 }
  } } } })
```

Lưu ý: Mongoose mặc định lưu `Number` là số thực. Nếu dùng validator `int` thì phải ép kiểu khi ghi, hoặc để validator ở mức `["int","long","double"]` kèm kiểm tra số nguyên ở service.

## 6. Truy vấn theo màn hình

| Màn hình | Truy vấn | Index dùng |
| --- | --- | --- |
| Danh sách chuyến | `trips.find({ memberIds: me }).sort({ startDate: -1 })`, nhóm theo trạng thái ở service | `memberIds + startDate` |
| Trang chuyến (cụm, số quán) | `clusters.find({ tripId })` + đếm `tripPlaces` theo `clusterId` với `isArchived: false` | `tripId + order`, `tripId + clusterId + order` |
| Xem quán của cụm | `tripPlaces.find({ tripId, clusterId, isArchived: false }).sort({ order: 1 })` | `tripId + clusterId + order` |
| Trip Mode (trang chủ) | `checkins.find({ tripId, dayDate })`, tổng chi `expenses` theo `tripId`, check-in mới nhất chưa có `expenses` và `movedToBell = false`, đếm thông báo chưa đọc | `tripId + dayDate + clusterId`, `tripId + dayDate`, `userId + tripId + createdAt` |
| Chi tiêu theo ngày, theo quán | `expenses.aggregate` nhóm theo `dayDate` hoặc `tripPlaceId`, ghép với `checkins` để ra quán chưa nhập | `tripId + dayDate` |
| Album | `moments.find({ tripId, dayDate? }).sort({ takenAt: -1 })` phân trang bằng cursor | `tripId + takenAt` |
| Recap ngày | `checkins` + `expenses` + `moments` của `dayDate` | các index trên |
| Recap chuyến | Tổng hợp trên cả chuyến, ảnh nổi bật theo ngày | `tripId + dayDate + isHighlight` |
| Link chia sẻ | `trips.findOne({ "share.token": t })` rồi truy vấn `moments` với `isPrivate: false` | `share.token` |
| Chuông thông báo | `notifications.find({ userId, tripId }).sort({ createdAt: -1 })` | `userId + tripId + createdAt` |

## 7. Nhất quán dữ liệu và xoá dây chuyền

- **Tạo check-in:** một request ghi hai tài liệu (`moments` nếu có ảnh, rồi `checkins`). Dùng transaction nếu cluster hỗ trợ, nếu không thì thứ tự ghi (moment trước, check-in sau) cộng `_id` do client sinh để gửi lại là an toàn. Cần kiểm tra Atlas M0 có hỗ trợ transaction khi triển khai.
- **Xoá Trip:** xoá `clusters`, `tripPlaces`, `checkins`, `expenses`, `moments`, `notifications` của trip. Trước đó lấy danh sách `photo.path` và `photo.thumbPath` để xoá file trong Supabase. Nếu xoá file lỗi thì ghi log để dọn lại sau, không chặn việc xoá.
- **Xoá quán (`tripPlaces`):** chưa có check-in thì xoá cứng. Đã có check-in thì `isArchived = true`.
- **Xoá cụm:** chỉ cụm `custom`, và chỉ khi cụm trống.
- **Xoá khoảnh khắc:** xoá file ảnh và thumbnail, gỡ `momentId` khỏi `checkins` nếu có, gỡ `coverMomentId` nếu đang là ảnh bìa.
- **Rút ngắn ngày của Trip:** dữ liệu thuộc ngày bị bỏ **không bị xoá**, chỉ ẩn khỏi giao diện (mặc định đề xuất). Nới lại ngày thì hiện ra lại. Có hỏi xác nhận ở API (FR-2).
- **Thành viên rời chuyến:** moment, check-in, chi tiêu họ đã tạo vẫn giữ nguyên, hiển thị theo `username`.

## 8. Ước lượng dung lượng

Với 2 người dùng, mỗi chuyến khoảng vài trăm tài liệu (vài chục quán, vài chục check-in và khoảnh khắc, vài chục thông báo), mỗi tài liệu dưới 2 KB. Cả năm vài chuyến chỉ vài MB, nằm gọn trong gói free của Atlas. Dung lượng đáng lo là **ảnh trong Supabase** (1 GB gói free), không phải MongoDB.

## 9. Khác với Tech Spec v0.1

| Chỗ | Tech Spec v0.1 | Database Design này | Lý do |
| --- | --- | --- | --- |
| `tripPlaces.status`, `chosenAt` | Có | **Bỏ** | Chuyến nhiều ngày dùng lại cùng cụm mỗi ngày, nên "đã chọn" phải tính theo ngày từ `checkins` |
| `checkins.photoPath` | Có | **Bỏ**, dùng `momentId` | Tránh lưu ảnh hai lần, ảnh check-in tự vào album |
| `checkins` | `tripPlaceId`, `userId`, `takenAt`… | Thêm `clusterId`, `dayDate`, `placeLabel`, `expenseReminder` | Tính hoàn thành cụm theo ngày, giữ tên khi quán bị archive |
| `expenseReminders` | Collection riêng | **Nhúng** vào `checkins.expenseReminder` | Ít collection, luôn đọc cùng check-in |
| `clientId` (checkins, moments) | Có | **Bỏ** từ v0.2, dùng `_id` do client sinh | Idempotent tự nhiên, không cần ánh xạ ID (API Contract mục 1) |
| `expenses.clientId` | Có | **Bỏ**, unique theo `checkinId` | Nhập tiền là upsert theo check-in nên tự idempotent |
| `refreshTokens` | Chưa có | **Thêm** | Cần cho xoay refresh token |
| `trips.share` | `shareToken` | `share { token, includeExpenses, createdAt }` | Cho phép chọn có hiện chi tiêu ở link chia sẻ không |
| `trips.currency`, `destinationGeo` | Chưa có | **Thêm** | Chuẩn bị cho nước ngoài, và lấy thời tiết |
| `tripPlaces` | Chưa có `source`, `isArchived`, `manualHours`, `manualPrice`, `order` | **Thêm** | Cho thêm tay, nhập giờ và giá tay, sắp xếp |
| `notifications` | `refId`, `payload` | Thêm `dedupeKey` | Client và server cùng tạo thông báo, cần chống trùng |

Tech Spec mục 7 nên được cập nhật cho khớp doc này.

## 10. Câu hỏi mở

- Người được mời có phải bấm chấp nhận không? Nếu có thì dùng `invitations` (mục 3.10).
- Rút ngắn ngày Trip: giữ và ẩn dữ liệu (mặc định ở đây) hay xoá hẳn?
- Danh sách tâm trạng (`mood`) cuối cùng gồm những giá trị nào?
- Giờ mặc định của 4 cụm có hợp lý không?
- Chi tiêu chỉ ghi lại, hay có chia tiền giữa thành viên?
- Chỉ Việt Nam hay cả nước ngoài (ảnh hưởng `tz`, `currency`)?
