const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// Use an isolated test database for repeatable verification
const TEST_DB_PATH = path.resolve(__dirname, '../data/test_cafe.db');
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Redirect DB module to test DB
process.env.TEST_DB = '1';

const { db, hashPassword, verifyPassword } = require('../src/db/database');

// Reset Pav Bhaji price to 100 for repeatable test runs
db.prepare('UPDATE menu_items SET price = 100 WHERE code = ?').run('11');

const auth = require('../src/db/auth');
const menu = require('../src/db/menu');
const bills = require('../src/db/bills');
const sales = require('../src/db/sales');
const expenses = require('../src/db/expenses');

console.log('🧪 Starting Cafe Management & Smart Billing System Verification Suite...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// Scenario 1: Owner logs in successfully
// -------------------------------------------------------------
test('Scenario 1: Owner logs in successfully with valid credentials', () => {
  const loginResult = auth.login('admin', 'admin123');
  assert.ok(loginResult.token, 'Token should be returned');
  assert.strictEqual(loginResult.user.username, 'admin');

  // Verify token authentication
  const sessionUser = auth.authenticate(loginResult.token);
  assert.ok(sessionUser, 'Session should authenticate');
  assert.strictEqual(sessionUser.id, loginResult.user.id);

  // Test invalid password rejection
  assert.throws(() => {
    auth.login('admin', 'wrong_password');
  }, /Invalid username\/email or password/);
});

// -------------------------------------------------------------
// Scenario 2: Owner selects today's date
// -------------------------------------------------------------
const todayStr = bills.getFormattedDate(new Date());
test('Scenario 2: Date selection defaults to today', () => {
  assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);
  const initialSales = sales.getDailySales(todayStr);
  assert.strictEqual(initialSales.date, todayStr);
});

// -------------------------------------------------------------
// Scenarios 3, 4, 5: Food Code 11 -> Pav Bhaji, quantity 2
// -------------------------------------------------------------
let pavBhajiItem = null;
test('Scenario 3 & 4: Enter food code 11 -> auto-fetch Pav Bhaji', () => {
  pavBhajiItem = menu.getMenuItemByCode('11');
  assert.ok(pavBhajiItem, 'Food code 11 should exist');
  assert.strictEqual(pavBhajiItem.name, 'Pav Bhaji');
  assert.strictEqual(pavBhajiItem.price, 100);
});

test('Scenario 5: Calculate line total for Pav Bhaji with quantity 2', () => {
  const qty = 2;
  const lineTotal = pavBhajiItem.price * qty;
  assert.strictEqual(lineTotal, 200, '2 Pav Bhaji @ ₹100 should be ₹200');
});

// -------------------------------------------------------------
// Scenario 6 & 7: Select another item from visual menu (e.g. Vada Pav code 13 @ ₹20, qty 3)
// -------------------------------------------------------------
let vadaPavItem = null;
test('Scenario 6 & 7: Select visual menu item and verify combined total', () => {
  vadaPavItem = menu.getMenuItemByCode('13');
  assert.ok(vadaPavItem, 'Vada Pav should exist');
  assert.strictEqual(vadaPavItem.name, 'Vada Pav');
  assert.strictEqual(vadaPavItem.price, 20);

  const subtotal = (pavBhajiItem.price * 2) + (vadaPavItem.price * 3);
  assert.strictEqual(subtotal, 260, 'Total should be ₹200 + ₹60 = ₹260');
});

// -------------------------------------------------------------
// Scenario 8, 9, 10, 11: Bill generation with optional mobile number
// -------------------------------------------------------------
let bill1 = null;
test('Scenario 8, 9, 10, 11: Generate bill, save with date & time, verify daily sales increase', () => {
  const initialSales = sales.getDailySales(todayStr);
  const initialRevenue = initialSales.total_sales;
  const initialBillCount = initialSales.total_bills;

  const testMobile = '9876543210';
  const idempotencyKey = 'test-idemp-' + Date.now();

  bill1 = bills.createBill({
    bill_date: todayStr,
    customer_mobile: testMobile,
    customer_name: 'Rahul Sharma',
    items: [
      { id: pavBhajiItem.id, code: pavBhajiItem.code, name: pavBhajiItem.name, price: pavBhajiItem.price, quantity: 2 },
      { id: vadaPavItem.id, code: vadaPavItem.code, name: vadaPavItem.name, price: vadaPavItem.price, quantity: 3 }
    ],
    discount: 10, // ₹10 discount
    payment_mode: 'Cash',
    idempotency_key: idempotencyKey
  });

  assert.ok(bill1.id, 'Bill ID must be generated');
  assert.ok(bill1.bill_number.startsWith('BILL-'), 'Unique bill number should be formatted');
  assert.strictEqual(bill1.bill_date, todayStr);
  assert.ok(bill1.bill_time, 'Bill time must be recorded');
  assert.strictEqual(bill1.customer_mobile, testMobile);
  assert.strictEqual(bill1.subtotal, 260);
  assert.strictEqual(bill1.discount, 10);
  assert.strictEqual(bill1.final_amount, 250);
  assert.strictEqual(bill1.items.length, 2);

  // Verify daily sales updated
  const updatedSales = sales.getDailySales(todayStr);
  assert.strictEqual(updatedSales.total_sales, initialRevenue + 250);
  assert.strictEqual(updatedSales.total_bills, initialBillCount + 1);
  assert.strictEqual(updatedSales.total_items_sold, initialSales.total_items_sold + 5);
});

// -------------------------------------------------------------
// Duplicate Prevention Test (Idempotency)
// -------------------------------------------------------------
test('Duplicate Bill Prevention: Submitting with same idempotency key returns existing bill', () => {
  const duplicateAttempt = bills.createBill({
    bill_date: todayStr,
    customer_mobile: '9876543210',
    items: [
      { id: pavBhajiItem.id, code: pavBhajiItem.code, name: pavBhajiItem.name, price: pavBhajiItem.price, quantity: 2 }
    ],
    idempotency_key: bill1.idempotency_key
  });

  assert.strictEqual(duplicateAttempt.id, bill1.id, 'Should return the identical bill, NOT create a new one');
  assert.strictEqual(duplicateAttempt.final_amount, 250);
});

// -------------------------------------------------------------
// Scenario 12 & 13: Multiple bills & Bill History
// -------------------------------------------------------------
let bill2 = null;
test('Scenario 12 & 13: Generate multiple bills and verify in Bill History', () => {
  const coldCoffee = menu.getMenuItemByCode('14'); // ₹80
  bill2 = bills.createBill({
    bill_date: todayStr,
    customer_mobile: '9123456780',
    items: [
      { id: coldCoffee.id, code: coldCoffee.code, name: coldCoffee.name, price: coldCoffee.price, quantity: 2 }
    ],
    payment_mode: 'UPI'
  });

  assert.strictEqual(bill2.final_amount, 160);

  // Fetch bill history
  const history = bills.getBills({ date: todayStr });
  assert.ok(history.bills.length >= 2, 'History should contain both bills');

  // Verify search by bill number
  const searchByBillNo = bills.getBills({ search: bill2.bill_number });
  assert.strictEqual(searchByBillNo.bills.length, 1);
  assert.strictEqual(searchByBillNo.bills[0].bill_number, bill2.bill_number);

  // Verify search by customer mobile
  const searchByMobile = bills.getBills({ search: '9123456780' });
  assert.ok(searchByMobile.bills.length >= 1);
  assert.strictEqual(searchByMobile.bills[0].customer_mobile, '9123456780');
});

// -------------------------------------------------------------
// Scenario 14: Select yesterday's date and view previous sales
// -------------------------------------------------------------
test("Scenario 14: Owner selects yesterday's date and views isolated records", () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayStr = bills.getFormattedDate(d);

  // Clear any existing bills for yesterday in tests for clean count
  db.prepare('DELETE FROM bills WHERE bill_date = ?').run(yesterdayStr);

  // Create a bill on yesterday's date
  const masalaPav = menu.getMenuItemByCode('12'); // ₹60
  const yesterdayBill = bills.createBill({
    bill_date: yesterdayStr,
    items: [
      { id: masalaPav.id, code: masalaPav.code, name: masalaPav.name, price: masalaPav.price, quantity: 3 }
    ],
    payment_mode: 'Cash'
  });

  const yesterdaySales = sales.getDailySales(yesterdayStr);
  assert.strictEqual(yesterdaySales.date, yesterdayStr);
  assert.strictEqual(yesterdaySales.total_sales, 180);
  assert.strictEqual(yesterdaySales.total_bills, 1);
  assert.strictEqual(yesterdaySales.total_items_sold, 3);
  assert.strictEqual(yesterdaySales.average_bill, 180);

  // Today's sales should NOT include yesterday's bill
  const todaySales = sales.getDailySales(todayStr);
  assert.ok(!todaySales.bills.some(b => b.id === yesterdayBill.id));
});

// -------------------------------------------------------------
// Scenario 15 & 16: Price update in Settings affects future bills, retains past bills!
// -------------------------------------------------------------
test('Scenario 15 & 16: Menu price update preserves old bill item prices', () => {
  // Ensure Pav Bhaji price starts at 100
  menu.updateMenuItem(pavBhajiItem.id, { price: 100 });
  pavBhajiItem = menu.getMenuItemById(pavBhajiItem.id);
  assert.strictEqual(pavBhajiItem.price, 100);

  // Check bill1 line item price for Pav Bhaji
  const bill1Details = bills.getBillById(bill1.id);
  const oldPavItem = bill1Details.items.find(i => i.item_code === '11');
  assert.strictEqual(oldPavItem.price, 100);
  assert.strictEqual(oldPavItem.line_total, 200);

  // Update Pav Bhaji price to ₹120 in Settings/Menu
  menu.updateMenuItem(pavBhajiItem.id, { price: 120 });

  // Verify updated item
  const updatedPav = menu.getMenuItemById(pavBhajiItem.id);
  assert.strictEqual(updatedPav.price, 120);

  // Generate NEW bill with Pav Bhaji
  const newBill = bills.createBill({
    bill_date: todayStr,
    items: [
      { id: updatedPav.id, code: updatedPav.code, name: updatedPav.name, price: updatedPav.price, quantity: 2 }
    ]
  });

  // Verify new bill uses updated price: 2 * ₹120 = ₹240
  assert.strictEqual(newBill.subtotal, 240);
  assert.strictEqual(newBill.final_amount, 240);
  const newPavItem = newBill.items.find(i => i.item_code === '11');
  assert.strictEqual(newPavItem.price, 120);

  // CRITICAL CHECK: Verify past bill1 STILL retains original ₹100 price!
  const pastBillCheck = bills.getBillById(bill1.id);
  const pastItemCheck = pastBillCheck.items.find(i => i.item_code === '11');
  assert.strictEqual(pastItemCheck.price, 100, 'Historical bill MUST retain original ₹100 price!');
  assert.strictEqual(pastBillCheck.final_amount, 250, 'Historical bill total must remain unchanged!');

  // Reset Pav Bhaji back to 100 for clean state
  menu.updateMenuItem(pavBhajiItem.id, { price: 100 });
});

// -------------------------------------------------------------
// Profit & Expense Tracking Tests
// -------------------------------------------------------------
test('Section 10: Profit tracking - unavailable when no expenses recorded', () => {
  const d = new Date();
  d.setDate(d.getDate() - 10);
  const pastDate = bills.getFormattedDate(d);

  // Clear any existing test bills and expenses for that date
  db.prepare('DELETE FROM bills WHERE bill_date = ?').run(pastDate);
  db.prepare('DELETE FROM expenses WHERE expense_date = ?').run(pastDate);

  // Create a bill with no expenses
  bills.createBill({
    bill_date: pastDate,
    items: [{ code: '13', name: 'Vada Pav', price: 20, quantity: 5 }]
  });

  const profitReport = expenses.getProfitReport(pastDate);
  assert.strictEqual(profitReport.total_sales, 100);
  assert.strictEqual(profitReport.has_expenses, false);
  assert.strictEqual(profitReport.net_profit, null, 'Net profit must be null if expenses are not entered');
  assert.match(profitReport.status_message, /Expenses not recorded/);
});

test('Section 10: Profit tracking - calculated accurately when expenses are entered', () => {
  // Clear any existing test expenses for today
  db.prepare('DELETE FROM expenses WHERE expense_date = ?').run(todayStr);

  // Add expenses for today
  expenses.addExpense({
    expense_date: todayStr,
    category: 'Food ingredients',
    amount: 150,
    description: 'Pav, vegetables and butter'
  });

  expenses.addExpense({
    expense_date: todayStr,
    category: 'Electricity',
    amount: 50,
    description: 'Daily power allocation'
  });

  const profitReport = expenses.getProfitReport(todayStr);
  assert.strictEqual(profitReport.has_expenses, true);
  assert.strictEqual(profitReport.total_expenses, 200);
  // Net profit = total sales - 200
  assert.strictEqual(profitReport.net_profit, profitReport.total_sales - 200);
});

// -------------------------------------------------------------
// Food Code Uniqueness Validation
// -------------------------------------------------------------
test('Section 9: Unique food code enforcement', () => {
  assert.throws(() => {
    menu.createMenuItem({
      code: '11', // Already taken by Pav Bhaji
      name: 'Duplicate Item',
      price: 50
    });
  }, /already in use/);
});

// -------------------------------------------------------------
// Owner WhatsApp Sender Number Setting & Profile Test
// -------------------------------------------------------------
test('Owner WhatsApp setting: can change and save owner number in settings', () => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  const newOwnerNumber = '+91 88888 99999';

  const updated = auth.updateProfile(user.id, {
    owner_whatsapp: newOwnerNumber,
    phone: newOwnerNumber
  });

  assert.strictEqual(updated.owner_whatsapp, newOwnerNumber, 'Owner WhatsApp number must be updated');

  // Verify that newly generated bill includes the updated owner WhatsApp number
  const testBill = bills.createBill({
    bill_date: todayStr,
    customer_mobile: '9876543210',
    items: [{ code: '11', name: 'Pav Bhaji', price: 100, quantity: 1 }]
  });

  assert.strictEqual(testBill.owner_whatsapp, newOwnerNumber, 'Bill must reflect updated owner WhatsApp sender number');
});

console.log(`\n🎉 All ${passedTests}/${totalTests} Verification Scenarios Passed Successfully!`);
