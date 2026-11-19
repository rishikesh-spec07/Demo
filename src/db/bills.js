const { db } = require('./database');

function getFormattedDate(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFormattedTime(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generateBillNumber(dateStr) {
  const cleanDate = dateStr.replace(/-/g, '');
  // Count existing bills for that date to create sequential number
  const row = db.prepare('SELECT COUNT(*) as count FROM bills WHERE bill_date = ?').get(dateStr);
  const nextSeq = String(row.count + 1).padStart(4, '0');
  return `BILL-${cleanDate}-${nextSeq}`;
}

function createBill(data) {
  const {
    bill_date,
    bill_time,
    customer_mobile = '',
    customer_name = '',
    items = [],
    discount = 0,
    payment_mode = 'Cash',
    notes = '',
    idempotency_key = null,
    user_id = null
  } = data;

  // 1. Idempotency Check: Prevent duplicate bills on multi-click
  if (idempotency_key) {
    const existingBill = db.prepare('SELECT * FROM bills WHERE idempotency_key = ?').get(idempotency_key);
    if (existingBill) {
      return getBillById(existingBill.id);
    }
  }

  // 2. Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Bill must contain at least one food item');
  }

  const effectiveDate = bill_date || getFormattedDate();
  const effectiveTime = bill_time || getFormattedTime();
  const billNumber = generateBillNumber(effectiveDate);

  // 3. Process items and calculate totals
  let subtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Invalid quantity for item "${item.name || item.item_name || item.code}"`);
    }

    const price = parseFloat(item.price);
    if (isNaN(price) || price < 0) {
      throw new Error(`Invalid price for item "${item.name || item.item_name || item.code}"`);
    }

    const lineTotal = Math.round(price * qty * 100) / 100;
    subtotal += lineTotal;

    processedItems.push({
      menu_item_id: item.id || item.menu_item_id || null,
      item_code: String(item.code || item.item_code || '').trim(),
      item_name: String(item.name || item.item_name || '').trim(),
      price: price,
      quantity: qty,
      line_total: lineTotal
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const numDiscount = Math.max(0, parseFloat(discount) || 0);
  const finalAmount = Math.max(0, Math.round((subtotal - numDiscount) * 100) / 100);

  const effectiveUserId = user_id || (db.prepare('SELECT id FROM users LIMIT 1').get()?.id) || null;

  // 4. Save in transaction
  db.exec('BEGIN TRANSACTION');
  try {
    const insertBill = db.prepare(`
      INSERT INTO bills (
        bill_number, bill_date, bill_time, customer_mobile, customer_name,
        subtotal, discount, final_amount, payment_mode, status, idempotency_key,
        notes, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const billResult = insertBill.run(
      billNumber,
      effectiveDate,
      effectiveTime,
      customer_mobile ? customer_mobile.trim() : '',
      customer_name ? customer_name.trim() : '',
      subtotal,
      numDiscount,
      finalAmount,
      payment_mode || 'Cash',
      idempotency_key || null,
      notes ? notes.trim() : '',
      effectiveUserId
    );

    const billId = Number(billResult.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO bill_items (bill_id, menu_item_id, item_code, item_name, price, quantity, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pItem of processedItems) {
      insertItem.run(
        billId,
        pItem.menu_item_id,
        pItem.item_code,
        pItem.item_name,
        pItem.price,
        pItem.quantity,
        pItem.line_total
      );
    }

    // Automatically store customer in owner's customer directory (upsert)
    if (customer_mobile && customer_mobile.trim()) {
      try {
        const { upsertCustomer } = require('./customers');
        upsertCustomer(customer_mobile, customer_name, finalAmount, effectiveDate, billId);
      } catch (custErr) {
        console.warn('Customer upsert note:', custErr.message);
      }
    }

    db.exec('COMMIT');
    return getBillById(billId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getBillById(id) {
  const bill = db.prepare(`
    SELECT b.*,
           COALESCE(u.cafe_name, (SELECT cafe_name FROM users LIMIT 1)) as cafe_name,
           COALESCE(u.phone, (SELECT phone FROM users LIMIT 1)) as cafe_phone,
           COALESCE(u.owner_whatsapp, u.phone, (SELECT COALESCE(owner_whatsapp, phone) FROM users LIMIT 1)) as owner_whatsapp,
           COALESCE(u.address, (SELECT address FROM users LIMIT 1)) as cafe_address,
           COALESCE(u.gstin, (SELECT gstin FROM users LIMIT 1)) as cafe_gstin,
           COALESCE(u.receipt_footer, (SELECT receipt_footer FROM users LIMIT 1)) as receipt_footer,
           COALESCE(u.currency_symbol, '₹') as currency_symbol
    FROM bills b
    LEFT JOIN users u ON b.user_id = u.id
    WHERE b.id = ?
  `).get(id);

  if (!bill) return null;

  const items = db.prepare(`
    SELECT id, bill_id, menu_item_id, item_code, item_name, price, quantity, line_total
    FROM bill_items
    WHERE bill_id = ?
    ORDER BY id ASC
  `).all(id);

  return {
    ...bill,
    items
  };
}

function getBillByNumber(billNumber) {
  const bill = db.prepare('SELECT id FROM bills WHERE bill_number = ?').get(billNumber);
  if (!bill) return null;
  return getBillById(bill.id);
}

function getBills(options = {}) {
  const { date, startDate, endDate, search, status, limit = 100, offset = 0 } = options;

  let query = `
    SELECT b.id, b.bill_number, b.bill_date, b.bill_time, b.customer_mobile,
           b.customer_name, b.subtotal, b.discount, b.final_amount, b.payment_mode,
           b.status, b.created_at,
           COUNT(bi.id) as item_count,
           SUM(bi.quantity) as total_quantity
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ' AND b.bill_date = ?';
    params.push(date);
  } else if (startDate && endDate) {
    query += ' AND b.bill_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(b.bill_number) LIKE ? OR LOWER(b.customer_mobile) LIKE ? OR LOWER(b.customer_name) LIKE ?)';
    params.push(term, term, term);
  }

  query += ' GROUP BY b.id ORDER BY b.id DESC';

  if (limit) {
    query += ' LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
  }

  const bills = db.prepare(query).all(...params);

  // Total count for pagination
  let countQuery = 'SELECT COUNT(DISTINCT b.id) as total FROM bills b WHERE 1=1';
  const countParams = [];

  if (date) {
    countQuery += ' AND b.bill_date = ?';
    countParams.push(date);
  } else if (startDate && endDate) {
    countQuery += ' AND b.bill_date BETWEEN ? AND ?';
    countParams.push(startDate, endDate);
  }

  if (status) {
    countQuery += ' AND b.status = ?';
    countParams.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    countQuery += ' AND (LOWER(b.bill_number) LIKE ? OR LOWER(b.customer_mobile) LIKE ? OR LOWER(b.customer_name) LIKE ?)';
    countParams.push(term, term, term);
  }

  const total = db.prepare(countQuery).get(...countParams).total;

  return {
    bills,
    total,
    limit,
    offset
  };
}

function cancelBill(id, reason = 'Cancelled by owner') {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    throw new Error('Bill not found');
  }

  if (bill.status === 'cancelled') {
    throw new Error('Bill is already cancelled');
  }

  db.prepare(`
    UPDATE bills
    SET status = 'cancelled', notes = CASE WHEN notes = '' THEN ? ELSE notes || ' | ' || ? END
    WHERE id = ?
  `).run(`Cancelled: ${reason}`, `Cancelled: ${reason}`, id);

  return getBillById(id);
}

module.exports = {
  createBill,
  getBillById,
  getBillByNumber,
  getBills,
  cancelBill,
  generateBillNumber,
  getFormattedDate,
  getFormattedTime
};

