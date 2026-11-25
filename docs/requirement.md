# Go!Go! – Product Requirements (v0.2)

*Cập nhật 23/11/2026 · Chỉnh theo wireframe và giao diện "B · hiện đại"*

Go!Go! là web app dùng cho từng chuyến đi: chuẩn bị quán theo cụm trước chuyến, trong chuyến lướt thẻ quán để chọn, chụp ảnh để check-in, ghi chi tiêu và xem recap sau chuyến.

**Khái niệm**
- **Trip:** một chuyến đi, có tên, điểm đến, ngày đi – ngày về và các thành viên.
- **Cụm:** nhóm quán theo bữa hoặc hoạt động (Ăn sáng, Ăn trưa, Ăn tối, Đi chơi, cụm tuỳ chỉnh). Mỗi cụm có khoảng giờ trong ngày.
- **Trip Mode:** giao diện trang chủ trong những ngày của chuyến.
- **Khoảnh khắc:** ảnh vuông 1:1 kèm ghi chú, tâm trạng, giờ và vị trí.

**Giao diện chung:** web app ưu tiên điện thoại (khung 390 px), font Be Vietnam Pro, màu chính xanh biển #17709F, điểm nhấn hồng #FF7BAC, nền #FFF7FA.

## 1. Tài khoản và chuyến đi

| ID | Yêu cầu |
| --- | --- |
| FR-1 | Đăng ký, đăng nhập bằng tên đăng nhập và mật khẩu. Tên trùng thì báo ngay dưới ô và gợi ý tên khác. Mỗi người dùng có một ID riêng, hiện ngay sau khi đăng ký và xem lại, sao chép được ở trang Tài khoản |
| FR-2 | Tạo, sửa, xoá Trip: tên, điểm đến, ngày đi – ngày về. Khi rút ngắn ngày làm mất ngày thì cảnh báo trước khi lưu. Xoá phải gõ đúng tên chuyến mới bật nút |
| FR-3 | Mời người khác vào Trip bằng tên đăng nhập hoặc ID. Thành viên cùng xem và chỉnh Trip. Báo rõ khi không tìm thấy người dùng hoặc người đó đã ở trong chuyến |
| FR-4 | Tự sinh các ngày theo khoảng ngày của Trip. Trạng thái tự động: Sắp đi / Đang đi / Đã xong. Danh sách chuyến chia nhóm theo trạng thái; chuyến Đang đi mở Trip Mode, chuyến Đã xong mở Recap |

## 2. Chuẩn bị trước chuyến

| ID | Yêu cầu |
| --- | --- |
| FR-5 | Trang chuyến hiển thị các cụm (Ăn sáng, Ăn trưa, Ăn tối, Đi chơi) kèm khoảng giờ và số quán. Chạm vào cụm mở thẳng trang xem quán của cụm, có tab chuyển giữa các cụm. Chỉnh được tên và giờ của cụm, thêm cụm tuỳ chỉnh. Không có bật/tắt cụm |
| FR-6 | Thêm quán vào cụm: tìm theo tên, chọn trên bản đồ, hoặc dán link Google Maps. Một cụm chứa nhiều quán |
| FR-7 | Gợi ý theo từ khoá: nhập "nướng" thì hiện quán rating cao quanh điểm đến, dạng danh sách và pin trên bản đồ, thêm vào cụm một chạm |
| FR-8 | Bộ lọc cho gợi ý: rating tối thiểu, khoảng giá, đang mở cửa, khoảng cách tối đa |
| FR-9 | Gợi ý theo vibe: mô tả cảm giác muốn có (yên tĩnh, đông vui, hẹn hò, view đẹp…) thì hiện quán phù hợp kèm lý do ngắn |
| FR-10 | Mỗi quán hiện: ảnh, rating, giá, giờ mở cửa, ghi chú của người dùng, link Google Maps |
| FR-11 | Xem tất cả quán của chuyến trên bản đồ, pin phân màu theo cụm |
| FR-27 | Thời tiết: lấy dự báo theo ngày và hiện ngay trên trang chuyến. Có mưa thì nhắc "nên chọn những quán có mái hiên". Không tự sắp xếp lại quán |

## 3. Trong chuyến đi (Trip Mode)

| ID | Yêu cầu |
| --- | --- |
| FR-12 | Mở web trong những ngày của Trip thì Trip Mode là trang chủ, không có nút quay lại. Logo Go!Go! ở góc trên dẫn về danh sách chuyến; chuông thông báo nằm cạnh logo |
| FR-13 | Đầu trang hiện tên chuyến, ngày thứ mấy và một dòng "Tổng chi tiêu" của cả chuyến (bấm để xem chi tiết). Thanh tiến trình các cụm trong ngày đánh dấu đã xong / đang tới / sắp tới; cụm đang tới hiện lên cùng các quán bên trong |
| FR-14 | Quán của cụm hiện dạng thẻ vuông ở giữa, lướt trái/phải. Mặt trước: ảnh phủ kín, lớp tối mờ ở dưới, tên, rating, khoảng cách. Chạm để lật: mặt sau có giờ mở cửa, ghi chú, nút Chỉ đường (mở Google Maps) và nút Check-in |
| FR-15 | Bấm Check-in mở khung chụp vuông 1:1 (kiểu Locket). Chụp xong là check-in xong: quán thành Đã chọn, cụm hoàn thành, lưu giờ và vị trí, ảnh vào album chung, rồi về trang chủ. Có lựa chọn check-in không ảnh |
| FR-16 | Không hỏi tiền lúc check-in. Sau khi check-in, trang chủ hiện khung nhắc "Quán X hết bao nhiêu?" (Nhập tiền / Bỏ qua). Bỏ qua 2 lần thì không nhắc ở trang chủ nữa, mục đó chuyển vào Thông báo. Nhập tiền bằng bàn phím số, kèm ghi chú tuỳ chọn |
| FR-17 | Nút "+ Quán khác": tìm hoặc chọn quán gần vị trí hiện tại (kèm gợi ý theo FR-7, FR-9) để check-in và ăn ở quán ngoài kế hoạch. Quán tự xếp vào cụm theo giờ, đổi cụm được |
| FR-18 | Dùng được offline cho ngày hiện tại; check-in, ảnh, chi tiêu, khoảnh khắc tạo lúc mất mạng tự đồng bộ khi có mạng |
| FR-26 | Thông báo (chuông): thời tiết, quán sắp đóng cửa, quán đóng cửa sớm hơn giờ của cụm, quán đã đóng, nhắc nhập tiền đã bị bỏ qua 2 lần. Thẻ quán sắp đóng có nhãn giờ đóng |

## 4. Khoảnh khắc

| ID | Yêu cầu |
| --- | --- |
| FR-20 | Nút "Lưu khoảnh khắc" mở thẳng khung chụp vuông 1:1. Chụp xong thêm ghi chú, tâm trạng (tuỳ chọn); ngày, giờ, địa điểm tự gắn, sửa tay được |
| FR-21 | Tải nhiều ảnh cùng lúc từ thư viện, nén trước khi tải; nhập ảnh bù sau chuyến theo giờ chụp trong ảnh (EXIF) |
| FR-28 | Album chung: mọi thành viên cùng đẩy ảnh vào một dòng thời gian theo ngày; ảnh vuông 1:1, có hiện người đăng. Ô ảnh nhỏ phía trên nút "Lưu khoảnh khắc" ở Trip Mode mở album |

## 5. Chi tiêu và Recap

| ID | Yêu cầu |
| --- | --- |
| FR-22 | Xem chi tiêu theo quán và theo ngày, tổng cả chuyến ở trên cùng. Quán chưa nhập tiền có nhãn "Chưa nhập" và nhập bù được |
| FR-23 | Recap ngày: các nơi đã tới theo giờ, ảnh, ghi chú, tổng chi trong ngày |
| FR-24 | Recap chuyến: bản đồ hành trình, số ngày và số nơi đã tới, ảnh nổi bật mỗi ngày, tổng chi |
| FR-25 | Chọn ảnh bìa, ẩn khoảnh khắc riêng tư, chia sẻ bằng link chỉ xem |
| FR-29 | Recap dạng ảnh vuông 1:1: xem theo lưới hoặc lướt từng ảnh, theo ngày hoặc cả chuyến, xuất ảnh vuông để chia sẻ |

## Đã bỏ hoặc gộp so với v0.1

- **FR-19 (check-in ngoài kế hoạch):** gộp vào FR-17 "+ Quán khác".
- **FR-26 cũ (cảnh báo khi lập kế hoạch):** bỏ cảnh báo quá xa nhau và quá nhiều chỗ; cảnh báo giờ đóng cửa chuyển vào Thông báo trong Trip Mode.
- **FR-27 cũ:** bỏ phần tự đẩy quán trong nhà/ngoài trời lên trước.
- **Màn Phát sinh:** bỏ, thay bằng "+ Quán khác".
- **Bật/tắt cụm:** bỏ.

## Lưu ý kỹ thuật

- Camera và vị trí cần HTTPS và quyền của người dùng.
- Offline và thông báo đẩy cần PWA; trên iPhone hạn chế hơn (cần thêm vào màn hình chính, iOS 16.4+ cho thông báo đẩy).
- Dữ liệu quán (rating, giờ mở, gợi ý) dự kiến lấy từ Google Places API, có tính phí theo lượt gọi.
- Cần lưu số lần bỏ qua nhắc nhập tiền theo từng quán.

## Cần chốt

- Chi tiêu chỉ ghi lại hay có chia tiền giữa các thành viên?
- Người được mời có phải bấm chấp nhận không, hay thêm thẳng vào chuyến?
- Chỉ Việt Nam hay cả nước ngoài (ảnh hưởng nguồn dữ liệu bản đồ)?
- Đồ án hay sản phẩm thật?
