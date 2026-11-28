import type { Expense } from '../../../../projects/shared/src/public-api';
import type { ExpenseDoc } from './expense.model';

export function toExpense(e: ExpenseDoc): Expense {
  return {
    checkinId: e.checkinId.toString(),
    tripPlaceId: e.tripPlaceId.toString(),
    dayDate: e.dayDate,
    amount: e.amount,
    note: e.note || null,
    enteredBy: e.enteredBy.toString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
