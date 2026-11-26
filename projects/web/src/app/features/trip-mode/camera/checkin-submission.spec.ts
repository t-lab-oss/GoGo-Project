import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import type { Checkin, Moment } from 'shared';
import { CheckinApi, CheckinSubmission } from './checkin-submission';
import type { CapturedPhoto } from './photo';

const photo: CapturedPhoto = {
  photo: new Blob(['abc'], { type: 'image/jpeg' }),
  thumb: new Blob(['a'], { type: 'image/jpeg' }),
  width: 1080,
  height: 1080,
};
const apiError = (status: number, code: string, details?: unknown) =>
  throwError(() => new HttpErrorResponse({ status, error: { error: { code, message: 'x', details } } }));
const checkin = { id: 'c' } as Checkin;
const moment = { id: 'm' } as Moment;

function fakeApi() {
  return jasmine.createSpyObj<CheckinApi>('api', {
    requestUpload: of({
      items: [{ momentId: 'm', photo: { uploadUrl: 'u1' }, thumb: { uploadUrl: 'u2' } }],
      expiresAt: '',
    }),
    uploadFile: Promise.resolve(),
    putCheckin: of({ checkin, moment }),
    putMoment: of(moment),
  });
}

const make = (api: CheckinApi, withPhoto = true) =>
  new CheckinSubmission(api, {
    tripId: 't',
    placeId: 'p',
    takenAt: new Date('2026-11-23T05:00:00Z'),
    photo: withPhoto ? photo : null,
    location: Promise.resolve({ lat: 1, lng: 2 }),
  });

describe('CheckinSubmission', () => {
  it('tải ảnh và thumbnail rồi tạo check-in với ID do client sinh', async () => {
    const api = fakeApi();
    const s = make(api);
    const outcome = await s.submit();
    expect(outcome.kind).toBe('created');
    expect(s.checkinId).toMatch(/^[0-9a-f]{24}$/);
    expect(api.uploadFile).toHaveBeenCalledWith('u1', photo.photo);
    expect(api.uploadFile).toHaveBeenCalledWith('u2', photo.thumb);
    expect(api.putCheckin).toHaveBeenCalledWith('t', s.checkinId, {
      tripPlaceId: 'p',
      takenAt: '2026-11-23T05:00:00.000Z',
      lat: 1,
      lng: 2,
      momentId: s.momentId!,
      photo: { width: 1080, height: 1080, bytes: 3 },
    });
  });

  it('check-in không ảnh không xin chỗ tải và không gửi momentId', async () => {
    const api = fakeApi();
    await make(api, false).submit();
    expect(api.requestUpload).not.toHaveBeenCalled();
    const body = api.putCheckin.calls.mostRecent().args[2];
    expect('momentId' in body).toBeFalse();
    expect('photo' in body).toBeFalse();
  });

  it('thử lại giữ nguyên ID và không tải lại ảnh đã tải xong', async () => {
    const api = fakeApi();
    api.putCheckin.and.returnValues(apiError(500, 'INTERNAL_ERROR'), of({ checkin, moment }));
    const s = make(api);
    await expectAsync(s.submit()).toBeRejected();
    await s.submit();
    expect(api.requestUpload).toHaveBeenCalledTimes(1);
    const [first, second] = api.putCheckin.calls.allArgs();
    expect(second).toEqual(first!);
  });

  it('tải ảnh lỗi thì lần sau tải lại cùng momentId', async () => {
    const api = fakeApi();
    api.uploadFile.and.returnValues(Promise.reject(new Error('net')), Promise.resolve(), Promise.resolve(), Promise.resolve());
    const s = make(api);
    await expectAsync(s.submit()).toBeRejected();
    expect(api.putCheckin).not.toHaveBeenCalled();
    await s.submit();
    expect(api.requestUpload.calls.allArgs()).toEqual([
      ['t', s.momentId!],
      ['t', s.momentId!],
    ]);
  });

  it('PHOTO_NOT_FOUND thì lần thử lại tải ảnh lại', async () => {
    const api = fakeApi();
    api.putCheckin.and.returnValues(apiError(422, 'PHOTO_NOT_FOUND'), of({ checkin, moment }));
    const s = make(api);
    await expectAsync(s.submit()).toBeRejected();
    await s.submit();
    expect(api.requestUpload).toHaveBeenCalledTimes(2);
  });

  it('ALREADY_CHECKED_IN có ảnh: lưu khoảnh khắc camera gắn check-in đã có', async () => {
    const api = fakeApi();
    api.putCheckin.and.returnValue(apiError(409, 'ALREADY_CHECKED_IN', { checkinId: 'other' }));
    api.putMoment.and.returnValues(apiError(500, 'INTERNAL_ERROR'), of(moment));
    const s = make(api);
    await expectAsync(s.submit()).toBeRejected();
    const outcome = await s.submit();
    expect(outcome.kind).toBe('joined');
    expect(api.putCheckin).toHaveBeenCalledTimes(1);
    const [, id, body] = api.putMoment.calls.mostRecent().args;
    expect(id).toBe(s.momentId!);
    expect(body.source).toBe('camera');
    expect(body.checkinId).toBe('other');
  });

  it('ALREADY_CHECKED_IN không ảnh: coi là đã check-in', async () => {
    const api = fakeApi();
    api.putCheckin.and.returnValue(apiError(409, 'ALREADY_CHECKED_IN', { checkinId: 'other' }));
    const outcome = await make(api, false).submit();
    expect(outcome.kind).toBe('already');
    expect(api.putMoment).not.toHaveBeenCalled();
  });
});
