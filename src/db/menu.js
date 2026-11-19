const { db } = require('./database');

function getCategories() {
  return db.prepare('SELECT id, name, display_order FROM categories ORDER BY display_order ASC, name ASC').all();
}

function createCategory(name, display_order = 0) {
  if (!name || !name.trim()) {
    throw new Error('Category name is required');
  }
  const cleanName = name.trim();
  const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
  if (existing) {
    throw new Error('Category with this name already exists');
  }

  const result = db.prepare('INSERT INTO categories (name, display_order) VALUES (?, ?)').run(cleanName, display_order);
  return { id: Number(result.lastInsertRowid), name: cleanName, display_order };
}

function updateCategory(id, name, display_order) {
  if (!name || !name.trim()) {
    throw new Error('Category name is required');
  }
  const cleanName = name.trim();
  const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(cleanName, id);
  if (existing) {
    throw new Error('Another category with this name already exists');
  }

  db.prepare(`
    UPDATE categories
    SET name = ?, display_order = COALESCE(?, display_order)
    WHERE id = ?
  `).run(cleanName, display_order, id);

  return { id, name: cleanName, display_order };
}

function deleteCategory(id) {
  // Move items in this category to null or verify
  db.prepare('UPDATE menu_items SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return true;
}

function getAllMenuItems(options = {}) {
  const { categoryId, search, activeOnly } = options;
  let query = `
    SELECT m.id, m.code, m.name, m.category_id, m.price, m.is_active, m.description,
           c.name as category_name
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (activeOnly) {
    query += ' AND m.is_active = 1';
  }

  if (categoryId && categoryId !== 'all') {
    query += ' AND m.category_id = ?';
    params.push(categoryId);
  }

  if (search && search.trim()) {
    query += ' AND (LOWER(m.name) LIKE ? OR LOWER(m.code) LIKE ?)';
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  query += ' ORDER BY CAST(m.code AS INTEGER) ASC, m.code ASC';

  return db.prepare(query).all(...params);
}

function getMenuItemByCode(code) {
  if (!code) return null;
  const cleanCode = String(code).trim();
  return db.prepare(`
    SELECT m.id, m.code, m.name, m.category_id, m.price, m.is_active, m.description,
           c.name as category_name
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE LOWER(m.code) = LOWER(?)
  `).get(cleanCode);
}

function getMenuItemById(id) {
  return db.prepare(`
    SELECT m.id, m.code, m.name, m.category_id, m.price, m.is_active, m.description,
           c.name as category_name
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.id = ?
  `).get(id);
}

function createMenuItem(data) {
  const { code, name, category_id, price, is_active = 1, description = '' } = data;

  if (!code || !String(code).trim()) {
    throw new Error('Food code is required');
  }
  if (!name || !name.trim()) {
    throw new Error('Food name is required');
  }
  const numPrice = parseFloat(price);
  if (isNaN(numPrice) || numPrice < 0) {
    throw new Error('Valid food price is required');
  }

  const cleanCode = String(code).trim();
  const existing = db.prepare('SELECT id FROM menu_items WHERE LOWER(code) = LOWER(?)').get(cleanCode);
  if (existing) {
    throw new Error(`Food code "${cleanCode}" is already in use. Each item must have a unique code.`);
  }

  const result = db.prepare(`
    INSERT INTO menu_items (code, name, category_id, price, is_active, description, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(cleanCode, name.trim(), category_id || null, numPrice, is_active ? 1 : 0, description.trim());

  return getMenuItemById(Number(result.lastInsertRowid));
}

function updateMenuItem(id, data) {
  const { code, name, category_id, price, is_active, description } = data;

  const current = getMenuItemById(id);
  if (!current) {
    throw new Error('Food item not found');
  }

  if (code) {
    const cleanCode = String(code).trim();
    const existing = db.prepare('SELECT id FROM menu_items WHERE LOWER(code) = LOWER(?) AND id != ?').get(cleanCode, id);
    if (existing) {
      throw new Error(`Food code "${cleanCode}" is already assigned to another item. Codes must be unique.`);
    }
  }

  let numPrice = current.price;
  if (price !== undefined) {
    numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      throw new Error('Price must be a valid positive number');
    }
  }

  db.prepare(`
    UPDATE menu_items
    SET code = COALESCE(?, code),
        name = COALESCE(?, name),
        category_id = ?,
        price = ?,
        is_active = COALESCE(?, is_active),
        description = COALESCE(?, description),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    code ? String(code).trim() : current.code,
    name ? name.trim() : current.name,
    category_id !== undefined ? (category_id || null) : current.category_id,
    numPrice,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    description !== undefined ? description.trim() : current.description,
    id
  );

  return getMenuItemById(id);
}

function toggleItemActive(id) {
  const item = getMenuItemById(id);
  if (!item) throw new Error('Item not found');
  const newStatus = item.is_active ? 0 : 1;
  db.prepare('UPDATE menu_items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);
  return { ...item, is_active: newStatus };
}

function deleteMenuItem(id) {
  const item = getMenuItemById(id);
  if (!item) throw new Error('Item not found');

  // Check if item has been billed before
  const billed = db.prepare('SELECT COUNT(*) as count FROM bill_items WHERE menu_item_id = ?').get(id);
  if (billed.count > 0) {
    // Soft-deactivate to protect historical bill integrity
    db.prepare('UPDATE menu_items SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return {
      deleted: false,
      deactivated: true,
      message: `Item "${item.name}" has ${billed.count} transaction records in past bills. To preserve historical reports, it was deactivated instead of permanently deleted.`
    };
  }

  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  return { deleted: true, deactivated: false, message: `Item "${item.name}" deleted successfully.` };
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllMenuItems,
  getMenuItemByCode,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  toggleItemActive,
  deleteMenuItem
};

