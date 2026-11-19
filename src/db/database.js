const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = path.resolve(__dirname, '../../data/cafe.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      cafe_name TEXT NOT NULL DEFAULT 'Cafe Delight',
      phone TEXT DEFAULT '+91 98765 43210',
      owner_whatsapp TEXT DEFAULT '+91 98765 43210',
      address TEXT DEFAULT '101, Baker Street, Food Plaza',
      gstin TEXT DEFAULT '',
      currency_symbol TEXT DEFAULT '₹',
      receipt_footer TEXT DEFAULT 'Thank you for visiting! Have a wonderful day.',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      bill_date TEXT NOT NULL,
      bill_time TEXT NOT NULL,
      customer_mobile TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      final_amount REAL NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      status TEXT NOT NULL DEFAULT 'completed',
      idempotency_key TEXT UNIQUE,
      notes TEXT DEFAULT '',
      user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      total_bills INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      last_bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
      last_visit_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);
    CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
    CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_menu_code ON menu_items(code);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  // Migrate existing databases to have owner_whatsapp column
  try {
    db.exec(`ALTER TABLE users ADD COLUMN owner_whatsapp TEXT DEFAULT '+91 98765 43210'`);
  } catch (e) {
    // Column already exists
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'));
}

function seedDefaults() {
  // Check if owner exists
  const userCheck = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCheck.count === 0) {
    const { hash, salt } = hashPassword('admin123');
    db.prepare(`
      INSERT INTO users (username, email, password_hash, salt, cafe_name, phone, address, receipt_footer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'admin',
      'owner@cafe.com',
      hash,
      salt,
      'Cafe Delight & Bistro',
      '+91 98765 43210',
      'Shop 12, Food Court, Commercial Plaza',
      'Thank you for visiting! Please come again.'
    );

    // Also add 'owner' as an alias/alternative user with cafe123
    const ownerCreds = hashPassword('cafe123');
    db.prepare(`
      INSERT INTO users (username, email, password_hash, salt, cafe_name, phone, address, receipt_footer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'owner',
      'cafeowner@delight.com',
      ownerCreds.hash,
      ownerCreds.salt,
      'Cafe Delight & Bistro',
      '+91 98765 43210',
      'Shop 12, Food Court, Commercial Plaza',
      'Thank you for visiting! Please come again.'
    );
  }

  // Seed default categories
  const catCheck = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCheck.count === 0) {
    const defaultCategories = [
      { name: 'Snacks', order: 1 },
      { name: 'Fast Food', order: 2 },
      { name: 'Beverages', order: 3 },
      { name: 'South Indian', order: 4 },
      { name: 'Combos & Meals', order: 5 },
      { name: 'Desserts', order: 6 }
    ];

    const insertCat = db.prepare('INSERT INTO categories (name, display_order) VALUES (?, ?)');
    for (const cat of defaultCategories) {
      insertCat.run(cat.name, cat.order);
    }
  }

  // Seed default menu items
  const menuCheck = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
  if (menuCheck.count === 0) {
    // Lookup category IDs
    const cats = db.prepare('SELECT id, name FROM categories').all();
    const catMap = {};
    cats.forEach(c => { catMap[c.name] = c.id; });

    const defaultItems = [
      { code: '11', name: 'Pav Bhaji', price: 100, cat: 'Snacks' },
      { code: '12', name: 'Masala Pav', price: 60, cat: 'Snacks' },
      { code: '13', name: 'Vada Pav', price: 20, cat: 'Snacks' },
      { code: '14', name: 'Cold Coffee', price: 80, cat: 'Beverages' },
      { code: '15', name: 'Veg Sandwich', price: 70, cat: 'Fast Food' },
      { code: '16', name: 'Hot Masala Chai', price: 20, cat: 'Beverages' },
      { code: '17', name: 'Cheese Grilled Sandwich', price: 120, cat: 'Fast Food' },
      { code: '18', name: 'French Fries', price: 90, cat: 'Fast Food' },
      { code: '19', name: 'Masala Dosa', price: 80, cat: 'South Indian' },
      { code: '20', name: 'Chocolate Milkshake', price: 110, cat: 'Beverages' },
      { code: '21', name: 'Paneer Tikka Roll', price: 130, cat: 'Fast Food' },
      { code: '22', name: 'Samosa (2 pcs)', price: 40, cat: 'Snacks' },
      { code: '23', name: 'Idli Sambar (2 pcs)', price: 60, cat: 'South Indian' },
      { code: '24', name: 'Cold Coffee with Ice Cream', price: 100, cat: 'Beverages' },
      { code: '25', name: 'Brownie with Ice Cream', price: 120, cat: 'Desserts' }
    ];

    const insertItem = db.prepare(`
      INSERT INTO menu_items (code, name, category_id, price, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);

    for (const item of defaultItems) {
      insertItem.run(item.code, item.name, catMap[item.cat] || null, item.price);
    }
  }
}

initSchema();
seedDefaults();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};

