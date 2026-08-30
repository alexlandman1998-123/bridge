import assert from 'node:assert/strict'
import { RENTAL_FINANCIAL_INVARIANTS, calculateChargeBalance, calculatePaymentBalance } from '../rentalFinancialModel.js'
assert.equal(calculatePaymentBalance(1000, [{ amount: 400 }, { amount: 100 }]).unappliedAmount, 500)
assert.equal(calculateChargeBalance(1000, [{ amount: 400 }]).outstandingAmount, 600)
assert.throws(() => calculatePaymentBalance(100, [{ amount: 101 }]), /Allocation total/)
assert.ok(RENTAL_FINANCIAL_INVARIANTS.some((item) => /append-only/i.test(item)))
console.log('Rental financial model tests passed.')
