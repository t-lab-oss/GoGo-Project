import type { Expense } from '../../../../projects/shared/src/public-api';
import type { ExpenseDoc } from '../expenses/expense.model';

export function toExpenseDto(e: ExpenseDoc & { updatedAt: Date }): Expense {
  return {
    checkinId: String(e.checkinId),
    tripPlaceId: String(e.tripPlaceId),
    dayDate: e.dayDate,
    amount: e.amount,
    note: e.note ?? '',
    enteredBy: String(e.enteredBy),
    updatedAt: e.updatedAt.toISOString(),
  };
}
