import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('trả 200 và status ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('đường dẫn lạ trả lỗi đúng định dạng', async () => {
    const res = await request(createApp()).get('/api/khong-co');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBeDefined();
  });
});
