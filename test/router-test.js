const { EventEmitter } = require('node:events');
const assert = require('node:assert');
const { handleApiRequest } = require('../src/api/router');

console.log('🧪 Starting Router & API Simulation Tests...\n');

class MockRequest extends EventEmitter {
  constructor(method, url, body = null, headers = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this._body = body;
  }

  send() {
    process.nextTick(() => {
      if (this._body) {
        const str = typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
        this.emit('data', Buffer.from(str));
      }
      this.emit('end');
    });
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = '';
    this.finished = false;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  end(data = '') {
    this.body += data;
    this.finished = true;
  }

  json() {
    return JSON.parse(this.body);
  }
}

async function simulate(method, url, body = null, token = null) {
  const headers = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const req = new MockRequest(method, url, body, headers);
  const res = new MockResponse();

  const promise = handleApiRequest(req, res);
  req.send();
  await promise;
  return res;
}

async function run() {
  // 1. Login
  const loginRes = await simulate('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert.strictEqual(loginRes.statusCode, 200);
  const token = loginRes.json().token;
  assert.ok(token);
  console.log('  ✅ /api/auth/login succeeded with session token');

  // 2. Auth me
  const meRes = await simulate('GET', '/api/auth/me', null, token);
  assert.strictEqual(meRes.statusCode, 200);
  assert.strictEqual(meRes.json().user.username, 'admin');
  console.log('  ✅ /api/auth/me succeeded');

  // 3. Menu code lookup
  const codeRes = await simulate('GET', '/api/menu/code/11', null, token);
  assert.strictEqual(codeRes.statusCode, 200);
  assert.strictEqual(codeRes.json().item.name, 'Pav Bhaji');
  console.log('  ✅ /api/menu/code/11 returned Pav Bhaji');

  // 4. Create Bill
  const billRes = await simulate('POST', '/api/bills', {
    customer_mobile: '9876543210',
    items: [
      { id: codeRes.json().item.id, code: '11', name: 'Pav Bhaji', price: 100, quantity: 2 },
      { code: '14', name: 'Cold Coffee', price: 80, quantity: 1 }
    ],
    discount: 10,
    payment_mode: 'Cash'
  }, token);
  assert.strictEqual(billRes.statusCode, 201);
  const bill = billRes.json().bill;
  assert.ok(bill.bill_number);
  assert.strictEqual(bill.final_amount, 270);
  console.log(`  ✅ /api/bills created bill ${bill.bill_number} for ₹${bill.final_amount}`);

  // 5. Daily Sales
  const salesRes = await simulate('GET', `/api/sales/daily?date=${bill.bill_date}`, null, token);
  assert.strictEqual(salesRes.statusCode, 200);
  const sales = salesRes.json().sales;
  assert.ok(sales.total_sales >= 270);
  assert.ok(sales.total_bills >= 1);
  console.log(`  ✅ /api/sales/daily updated revenue: ₹${sales.total_sales}, bills: ${sales.total_bills}`);

  // 6. Profit
  const profitRes = await simulate('GET', `/api/profit?date=${bill.bill_date}`, null, token);
  assert.strictEqual(profitRes.statusCode, 200);
  console.log(`  ✅ /api/profit returned: has_expenses=${profitRes.json().report.has_expenses}`);

  console.log('\n🎉 All API and Controller Simulation Tests Passed with 100% Success!\n');
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});

