const http = require('node:http');
const assert = require('node:assert');
const { server } = require('../server');

console.log('🌐 Starting End-to-End HTTP Server & API Tests...\n');

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  🚀 Test server running at ${baseUrl}`);

  function makeRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = res.headers['content-type']?.includes('application/json')
              ? JSON.parse(data)
              : data;
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  try {
    // 1. Static file check
    const indexRes = await makeRequest('GET', '/');
    assert.strictEqual(indexRes.status, 200);
    assert.ok(indexRes.body.includes('Cafe Management & Smart Billing System'));
    console.log('  ✅ Static index.html served successfully');

    const cssRes = await makeRequest('GET', '/css/style.css');
    assert.strictEqual(cssRes.status, 200);
    console.log('  ✅ CSS stylesheet served successfully');

    // 2. Auth Login API
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.ok, true);
    assert.ok(loginRes.body.token);
    const token = loginRes.body.token;
    console.log('  ✅ Auth login API succeeded with token');

    // 3. Auth Me
    const meRes = await makeRequest('GET', '/api/auth/me', null, token);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.username, 'admin');
    console.log('  ✅ Auth verification (/api/auth/me) succeeded');

    // 4. Menu code lookup (Method 1)
    const code11Res = await makeRequest('GET', '/api/menu/code/11', null, token);
    assert.strictEqual(code11Res.status, 200);
    assert.strictEqual(code11Res.body.item.name, 'Pav Bhaji');
    console.log('  ✅ Code lookup for 11 returned Pav Bhaji');

    // 5. Generate Bill via API
    const billRes = await makeRequest('POST', '/api/bills', {
      customer_mobile: '9988776655',
      items: [
        { id: code11Res.body.item.id, code: '11', name: 'Pav Bhaji', price: code11Res.body.item.price, quantity: 2 },
        { code: '14', name: 'Cold Coffee', price: 80, quantity: 1 }
      ],
      discount: 20,
      payment_mode: 'UPI'
    }, token);
    assert.strictEqual(billRes.status, 201);
    assert.ok(billRes.body.bill.bill_number);
    assert.strictEqual(billRes.body.bill.customer_mobile, '9988776655');
    console.log(`  ✅ Bill ${billRes.body.bill.bill_number} generated successfully`);

    // 6. Daily sales API
    const salesRes = await makeRequest('GET', `/api/sales/daily?date=${billRes.body.bill.bill_date}`, null, token);
    assert.strictEqual(salesRes.status, 200);
    assert.ok(salesRes.body.sales.total_sales > 0);
    console.log(`  ✅ Daily sales updated with total ₹${salesRes.body.sales.total_sales}`);

    // 7. Profit report API
    const profitRes = await makeRequest('GET', `/api/profit?date=${billRes.body.bill.bill_date}`, null, token);
    assert.strictEqual(profitRes.status, 200);
    console.log(`  ✅ Profit API reported: has_expenses=${profitRes.body.report.has_expenses}, net_profit=${profitRes.body.report.net_profit}`);

    console.log('\n🎉 All End-to-End HTTP Server Tests Passed Perfectly!\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ HTTP Test Failed:', err);
    server.close();
    process.exit(1);
  }
});

