const { db } = require('./database');

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

function upsertCustomer(phone, name = '', billAmount = 0, billDate = '', billId = null) {
  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone || cleanPhone.length < 5) return null;

  const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
  const amount = parseFloat(billAmount) || 0;

  if (existing) {
    const updatedName = name && name.trim() ? name.trim() : existing.name;
    db.prepare(`
      UPDATE customers
      SET total_bills = total_bills + 1,
          total_spent = total_spent + ?,
          name = ?,
          last_bill_id = COALESCE(?, last_bill_id),
          last_visit_date = COALESCE(?, last_visit_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, updatedName, billId, billDate, existing.id);

    return db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
  } else {
    const result = db.prepare(`
      INSERT INTO customers (phone, name, total_bills, total_spent, last_visit_date, last_bill_id)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(cleanPhone, name ? name.trim() : '', amount, billDate || null, billId || null);

    return db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(result.lastInsertRowid));
  }
}

function getCustomers(options = {}) {
  const { search = '', limit = 100, offset = 0 } = options;
  let query = 'SELECT * FROM customers WHERE 1=1';
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(phone) LIKE ? OR LOWER(name) LIKE ?)';
    params.push(term, term);
  }

  query += ' ORDER BY datetime(updated_at) DESC, total_spent DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const customers = db.prepare(query).all(...params);

  // Stats
  const totalStats = db.prepare(`
    SELECT
      COUNT(*) as total_customers,
      COALESCE(SUM(CASE WHEN total_bills > 1 THEN 1 ELSE 0 END), 0) as repeat_customers,
      COALESCE(SUM(total_spent), 0) as total_customer_spend
    FROM customers
  `).get();

  return {
    customers,
    stats: {
      total_customers: Number(totalStats.total_customers),
      repeat_customers: Number(totalStats.repeat_customers),
      total_customer_spend: Math.round(Number(totalStats.total_customer_spend) * 100) / 100
    }
  };
}

function getCustomerByPhone(phone) {
  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone) return null;
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
}

function getCustomerBills(customerPhone) {
  const cleanPhone = cleanPhoneNumber(customerPhone);
  if (!cleanPhone) return [];
  return db.prepare(`
    SELECT b.id, b.bill_number, b.bill_date, b.bill_time, b.final_amount, b.payment_mode, b.status,
           COUNT(bi.id) as item_count, SUM(bi.quantity) as total_quantity
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE b.customer_mobile LIKE ?
    GROUP BY b.id
    ORDER BY b.id DESC
  `).all(`%${cleanPhone}%`);
}

module.exports = {
  cleanPhoneNumber,
  upsertCustomer,
  getCustomers,
  getCustomerByPhone,
  getCustomerBills
};

