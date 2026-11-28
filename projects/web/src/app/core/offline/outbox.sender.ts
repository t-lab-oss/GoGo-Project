import { InjectionToken } from '@angular/core';
import type { OutboxOp } from './outbox.types';

export interface SendResult {
  /** Check-in có sẵn của người khác, khi quán đã được check-in hôm đó. */
  existingCheckinId?: string;
}

export interface OutboxSender {
  send(tripId: string, op: OutboxOp): Promise<SendResult>;
  /** Máy chủ có tới được không. */
  ping(): Promise<boolean>;
}

/** Cách gửi từng loại việc; Trip Mode cung cấp bản thật, test cung cấp bản giả. */
export const OUTBOX_SENDER = new InjectionToken<OutboxSender>('OUTBOX_SENDER');
