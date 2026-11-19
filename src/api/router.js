const auth = require('../db/auth');
const menu = require('../db/menu');
const bills = require('../db/bills');
const sales = require('../db/sales');
const expenses = require('../db/expenses');
const customers = require('../db/customers');

// Helpers for request parsing
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) {
        // 2MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    ok: false,
    error: message,
    details
  });
}

// Extract auth token from Authorization header or cookie
function getAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookies = parseCookies(req);
  return cookies.session_token || null;
}

async function handleApiRequest(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  try {
    // -------------------------------------------------------------
    // Public Auth Route: Login
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const { username, password, rememberMe } = body;
      try {
        const result = auth.login(username, password, rememberMe !== false);
        const cookieFlags = 'Path=/; HttpOnly; SameSite=Lax';
        const maxAge = rememberMe !== false ? '; Max-Age=2592000' : '';
        sendJson(res, 200, { ok: true, user: result.user, token: result.token }, {
          'Set-Cookie': `session_token=${result.token}; ${cookieFlags}${maxAge}`
        });
      } catch (err) {
        sendError(res, 401, err.message);
      }
      return true;
    }

    // -------------------------------------------------------------
    // Auth Middleware for protected routes
    // -------------------------------------------------------------
    const token = getAuthToken(req);
    const currentUser = auth.authenticate(token);

    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!currentUser) {
        return sendError(res, 401, 'Not authenticated');
      }
      return sendJson(res, 200, { ok: true, user: currentUser });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      if (token) {
        auth.logout(token);
      }
      sendJson(res, 200, { ok: true, message: 'Logged out successfully' }, {
        'Set-Cookie': 'session_token=; Path=/; HttpOnly; Max-Age=0'
      });
      return true;
    }

    // Require authentication for all subsequent API endpoints
    if (!currentUser) {
      sendError(res, 401, 'Authentication required to access cafe records');
      return true;
    }

    // -------------------------------------------------------------
    // Profile & Settings
    // -------------------------------------------------------------
    if (pathname === '/api/auth/profile' && method === 'PUT') {
      const body = await parseBody(req);
      const updatedUser = auth.updateProfile(currentUser.id, body);
      return sendJson(res, 200, { ok: true, user: updatedUser });
    }

    if (pathname === '/api/auth/password' && method === 'PUT') {
      const body = await parseBody(req);
      try {
        auth.changePassword(currentUser.id, body.oldPassword, body.newPassword);
        return sendJson(res, 200, { ok: true, message: 'Password updated successfully' });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    // -------------------------------------------------------------
    // Categories
    // -------------------------------------------------------------
    if (pathname === '/api/categories' && method === 'GET') {
      const categories = menu.getCategories();
      return sendJson(res, 200, { ok: true, categories });
    }

    if (pathname === '/api/categories' && method === 'POST') {
      const body = await parseBody(req);
      const category = menu.createCategory(body.name, body.display_order);
      return sendJson(res, 201, { ok: true, category });
    }

    const catMatch = pathname.match(/^\/api\/categories\/(\d+)$/);
    if (catMatch) {
      const catId = parseInt(catMatch[1], 10);
      if (method === 'PUT') {
        const body = await parseBody(req);
        const category = menu.updateCategory(catId, body.name, body.display_order);
        return sendJson(res, 200, { ok: true, category });
      }
      if (method === 'DELETE') {
        menu.deleteCategory(catId);
        return sendJson(res, 200, { ok: true, message: 'Category deleted' });
      }
    }

    // -------------------------------------------------------------
    // Menu Items
    // -------------------------------------------------------------
    if (pathname === '/api/menu' && method === 'GET') {
      const items = menu.getAllMenuItems({
        categoryId: query.category,
        search: query.search,
        activeOnly: query.activeOnly === 'true'
      });
      return sendJson(res, 200, { ok: true, items });
    }

    // Method 1: Lookup food item by code (instant lookup for billing screen)
    const codeMatch = pathname.match(/^\/api\/menu\/code\/(.+)$/);
    if (codeMatch && method === 'GET') {
      const code = decodeURIComponent(codeMatch[1]);
      const item = menu.getMenuItemByCode(code);
      if (!item) {
        return sendError(res, 404, `Food item with code "${code}" not found`);
      }
      return sendJson(res, 200, { ok: true, item });
    }

    if (pathname === '/api/menu' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const item = menu.createMenuItem(body);
        return sendJson(res, 201, { ok: true, item });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    const itemToggleMatch = pathname.match(/^\/api\/menu\/(\d+)\/toggle$/);
    if (itemToggleMatch && method === 'POST') {
      const itemId = parseInt(itemToggleMatch[1], 10);
      try {
        const item = menu.toggleItemActive(itemId);
        return sendJson(res, 200, { ok: true, item });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    const itemMatch = pathname.match(/^\/api\/menu\/(\d+)$/);
    if (itemMatch) {
      const itemId = parseInt(itemMatch[1], 10);
      if (method === 'GET') {
        const item = menu.getMenuItemById(itemId);
        if (!item) return sendError(res, 404, 'Item not found');
        return sendJson(res, 200, { ok: true, item });
      }
      if (method === 'PUT') {
        const body = await parseBody(req);
        try {
          const item = menu.updateMenuItem(itemId, body);
          return sendJson(res, 200, { ok: true, item });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }
      if (method === 'DELETE') {
        try {
          const result = menu.deleteMenuItem(itemId);
          return sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }
    }

    // -------------------------------------------------------------
    // Bills & Checkout
    // -------------------------------------------------------------
    if (pathname === '/api/bills' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const bill = bills.createBill({
          ...body,
          user_id: currentUser.id
        });
        return sendJson(res, 201, { ok: true, bill });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    if (pathname === '/api/bills' && method === 'GET') {
      const result = bills.getBills({
        date: query.date,
        startDate: query.startDate,
        endDate: query.endDate,
        search: query.search,
        status: query.status,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    const billCancelMatch = pathname.match(/^\/api\/bills\/(\d+)\/cancel$/);
    if (billCancelMatch && method === 'POST') {
      const billId = parseInt(billCancelMatch[1], 10);
      const body = await parseBody(req);
      try {
        const bill = bills.cancelBill(billId, body.reason);
        return sendJson(res, 200, { ok: true, bill });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    const billDetailMatch = pathname.match(/^\/api\/bills\/(\d+)$/);
    if (billDetailMatch && method === 'GET') {
      const billId = parseInt(billDetailMatch[1], 10);
      const bill = bills.getBillById(billId);
      if (!bill) return sendError(res, 404, 'Bill not found');
      return sendJson(res, 200, { ok: true, bill });
    }

    // -------------------------------------------------------------
    // Customer Directory (Owner's Customer List)
    // -------------------------------------------------------------
    if (pathname === '/api/customers' && method === 'GET') {
      const result = customers.getCustomers({
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : 100,
        offset: query.offset ? parseInt(query.offset, 10) : 0
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    const custLookupMatch = pathname.match(/^\/api\/customers\/lookup\/(.+)$/);
    if (custLookupMatch && method === 'GET') {
      const phone = decodeURIComponent(custLookupMatch[1]);
      const customer = customers.getCustomerByPhone(phone);
      return sendJson(res, 200, { ok: true, customer });
    }

    const custBillsMatch = pathname.match(/^\/api\/customers\/(.+)\/bills$/);
    if (custBillsMatch && method === 'GET') {
      const phone = decodeURIComponent(custBillsMatch[1]);
      const billList = customers.getCustomerBills(phone);
      return sendJson(res, 200, { ok: true, bills: billList });
    }

    // -------------------------------------------------------------
    // Daily Sales & Dashboard Stats
    // -------------------------------------------------------------
    if (pathname === '/api/sales/daily' && method === 'GET') {
      const targetDate = query.date || bills.getFormattedDate();
      const dailyData = sales.getDailySales(targetDate);
      return sendJson(res, 200, { ok: true, sales: dailyData });
    }

    if (pathname === '/api/sales/trends' && method === 'GET') {
      const days = query.days ? parseInt(query.days, 10) : 7;
      const trends = sales.getSalesRangeSummary(days);
      return sendJson(res, 200, { ok: true, trends });
    }

    // -------------------------------------------------------------
    // Profit & Expenses
    // -------------------------------------------------------------
    if (pathname === '/api/profit' && method === 'GET') {
      const targetDate = query.date || bills.getFormattedDate();
      const report = expenses.getProfitReport(targetDate);
      return sendJson(res, 200, { ok: true, report });
    }

    if (pathname === '/api/expenses' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const expense = expenses.addExpense({
          ...body,
          user_id: currentUser.id
        });
        return sendJson(res, 201, { ok: true, expense });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    const expenseMatch = pathname.match(/^\/api\/expenses\/(\d+)$/);
    if (expenseMatch) {
      const expenseId = parseInt(expenseMatch[1], 10);
      if (method === 'PUT') {
        const body = await parseBody(req);
        try {
          const expense = expenses.updateExpense(expenseId, body);
          return sendJson(res, 200, { ok: true, expense });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }
      if (method === 'DELETE') {
        try {
          expenses.deleteExpense(expenseId);
          return sendJson(res, 200, { ok: true, message: 'Expense deleted' });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }
    }

    // Route not found
    return sendError(res, 404, `Endpoint ${method} ${pathname} not found`);
  } catch (err) {
    console.error('API Error:', err);
    return sendError(res, 500, 'Internal Server Error', err.message);
  }
}

module.exports = {
  handleApiRequest
};
