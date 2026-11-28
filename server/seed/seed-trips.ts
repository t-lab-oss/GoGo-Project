/**
 * Chuyến mẫu "Phú Quốc" để làm Trip Mode: 4 ngày, hôm nay luôn là ngày 2.
 * Chạy lại an toàn: mỗi lần chạy dịch ngày cho khớp hôm nay và chỉ thêm phần còn thiếu.
 * Giả định múi giờ mặc định Asia/Ho_Chi_Minh (UTC+7).
 */
import type { Types } from 'mongoose';
import { now } from '../src/lib/clock';
import { addDays, dateIn } from '../src/lib/trip-dates';
import { CheckinModel } from '../src/modules/checkins/checkin.model';
import { ClusterModel } from '../src/modules/clusters/cluster.model';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { TripPlaceModel } from '../src/modules/places/trip-place.model';
import { TripModel } from '../src/modules/trips/trip.model';
import { UserModel } from '../src/modules/users/user.model';

const TZ = 'Asia/Ho_Chi_Minh';
const TRIP_NAME = 'Phú Quốc';

const CLUSTERS = [
  { type: 'breakfast', name: 'Ăn sáng', startTime: '06:00', endTime: '09:00', order: 1 },
  { type: 'lunch', name: 'Ăn trưa', startTime: '11:00', endTime: '14:00', order: 2 },
  { type: 'dinner', name: 'Ăn tối', startTime: '17:00', endTime: '21:00', order: 3 },
  { type: 'activity', name: 'Đi chơi', startTime: '09:00', endTime: '17:00', order: 4 },
] as const;

type Seed = {
  label: string;
  lat: number;
  lng: number;
  note: string;
  open: string;
  close: string;
  price: string;
};

const PLACES: Record<(typeof CLUSTERS)[number]['type'], Seed[]> = {
  breakfast: [
    { label: 'Bún quậy Kiến Xây', lat: 10.2203, lng: 103.9577, note: 'Đi sớm kẻo hết chỗ', open: '06:00', close: '10:00', price: '50.000–90.000 đ' },
    { label: 'Bánh canh chả cá Dương Đông', lat: 10.2162, lng: 103.9654, note: '', open: '05:30', close: '11:00', price: '30.000–50.000 đ' },
  ],
  lunch: [
    { label: 'Quán 4', lat: 10.2145, lng: 103.9619, note: 'Gọi ghẹ hấp', open: '10:30', close: '21:00', price: '100.000–200.000 đ' },
    { label: 'Quán 3', lat: 10.2188, lng: 103.9621, note: 'Quán nhỏ, có mái hiên', open: '10:00', close: '14:00', price: '60.000–120.000 đ' },
    { label: 'Quán 5', lat: 10.2231, lng: 103.9693, note: '', open: '10:00', close: '22:00', price: '80.000–150.000 đ' },
  ],
  dinner: [
    { label: 'Chợ đêm Phú Quốc', lat: 10.2147, lng: 103.9644, note: 'Hải sản nướng', open: '17:00', close: '23:00', price: '100.000–300.000 đ' },
    { label: 'Nhà hàng Xin Chào', lat: 10.2201, lng: 103.9602, note: 'Có view biển', open: '17:00', close: '22:30', price: '150.000–350.000 đ' },
  ],
  activity: [
    { label: 'Bãi Sao', lat: 10.0548, lng: 104.0348, note: 'Mang kem chống nắng', open: '06:00', close: '18:00', price: 'Miễn phí' },
    { label: 'Hòn Thơm cáp treo', lat: 9.9511, lng: 104.0207, note: '', open: '08:00', close: '17:00', price: '600.000 đ' },
  ],
};

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

export async function seedDemoTrip(): Promise<void> {
  const users = await UserModel.find({ username: { $in: ['hany', 'tiencuto'] } });
  const owner = users.find((u) => u.username === 'hany') ?? users[0];
  if (!owner) {
    console.log('- Chuyến mẫu: chưa có tài khoản, bỏ qua (chạy seed tài khoản trước).');
    return;
  }
  const memberIds = users.map((u) => u._id);

  const today = dateIn(now(), TZ);
  const startDate = addDays(today, -1);
  const endDate = addDays(today, 2);

  let trip = await TripModel.findOne({ name: TRIP_NAME, ownerId: owner._id });
  if (trip) {
    trip.startDate = startDate;
    trip.endDate = endDate;
    trip.memberIds = memberIds;
    await trip.save();
    console.log(`- Chuyến "${TRIP_NAME}": đã có, dịch ngày về ${startDate} → ${endDate}.`);
  } else {
    trip = await TripModel.create({
      name: TRIP_NAME,
      destination: 'Phú Quốc',
      destinationGeo: { lat: 10.2899, lng: 103.984 },
      startDate,
      endDate,
      tz: TZ,
      ownerId: owner._id,
      memberIds,
    });
    console.log(`- Chuyến "${TRIP_NAME}": đã tạo (${startDate} → ${endDate}).`);
  }

  const clusterIds = new Map<string, Types.ObjectId>();
  const placeIds = new Map<string, { id: Types.ObjectId; clusterId: Types.ObjectId; label: string }>();

  for (const c of CLUSTERS) {
    const cluster = await ClusterModel.findOneAndUpdate(
      { tripId: trip._id, type: c.type },
      { $setOnInsert: { tripId: trip._id, ...c } },
      { upsert: true, returnDocument: 'after' },
    );
    clusterIds.set(c.type, cluster._id);

    let order = 1;
    for (const p of PLACES[c.type]) {
      const place = await TripPlaceModel.findOneAndUpdate(
        { tripId: trip._id, clusterId: cluster._id, label: p.label },
        {
          $setOnInsert: {
            tripId: trip._id,
            clusterId: cluster._id,
            source: 'manual',
            label: p.label,
            lat: p.lat,
            lng: p.lng,
            note: p.note,
            manualHours: { open: p.open, close: p.close },
            manualPrice: p.price,
            order,
            addedBy: owner._id,
            isArchived: false,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      placeIds.set(p.label, { id: place._id, clusterId: cluster._id, label: p.label });
      order += 1;
    }
  }

  // Check-in và chi tiêu mẫu: sáng + trưa ngày 1, sáng ngày 2 (nên hôm nay cụm "Ăn sáng" đã xong)
  const samples = [
    { label: 'Bún quậy Kiến Xây', date: startDate, time: '07:30', amount: 140000 },
    { label: 'Quán 4', date: startDate, time: '12:10', amount: 320000 },
    { label: 'Bánh canh chả cá Dương Đông', date: today, time: '07:15', amount: 85000 },
  ];
  for (const s of samples) {
    const place = placeIds.get(s.label);
    if (!place) continue;
    let checkin = await CheckinModel.findOne({ tripPlaceId: place.id, dayDate: s.date });
    if (!checkin) {
      checkin = await CheckinModel.create({
        tripId: trip._id,
        clusterId: place.clusterId,
        tripPlaceId: place.id,
        placeLabel: place.label,
        userId: owner._id,
        dayDate: s.date,
        takenAt: at(s.date, s.time),
        lat: 10.21,
        lng: 103.96,
      });
    }
    await ExpenseModel.updateOne(
      { checkinId: checkin._id },
      {
        $setOnInsert: {
          tripId: trip._id,
          checkinId: checkin._id,
          tripPlaceId: place.id,
          dayDate: s.date,
          amount: s.amount,
          enteredBy: owner._id,
        },
      },
      { upsert: true },
    );
  }
  console.log('- Cụm, quán, check-in và chi tiêu mẫu: đã đủ.');
}
