const { db } = require('./database');
const { getDailySales } = require('./sales');
const { getFormattedDate } = require('./bills');

const EXPENSE_CATEGORIES = [
  'Food ingredients',
  'Staff salaries',
  'Electricity',
  'Rent',
  'Gas & Fuel',
  'Packaging & Disposables',
  'Maintenance & Repairs',
  'Other expenses'
];

function getExpensesByDate(dateStr) {
  const targetDate = dateStr || getFormattedDate();
  const expenses = db.prepare(`
    SELECT id, expense_date, category, amount, description, created_at
    FROM expenses
    WHERE expense_date = ?
    ORDER BY id DESC
  `).all(targetDate);

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Category summary
  const categorySummary = db.prepare(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM expenses
    WHERE expense_date = ?
    GROUP BY category
    ORDER BY total DESC
  `).all(targetDate);

  return {
    date: targetDate,
    expenses,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    category_summary: categorySummary,
    has_expenses: expenses.length > 0
  };
}

function addExpense(data) {
  const { expense_date, category, amount, description = '', user_id = null } = data;

  if (!category || !category.trim()) {
    throw new Error('Expense category is required');
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Expense amount must be a positive number');
  }

  const targetDate = expense_date || getFormattedDate();

  const result = db.prepare(`
    INSERT INTO expenses (expense_date, category, amount, description, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(targetDate, category.trim(), numAmount, description ? description.trim() : '', user_id);

  return {
    id: Number(result.lastInsertRowid),
    expense_date: targetDate,
    category: category.trim(),
    amount: numAmount,
    description: description ? description.trim() : ''
  };
}

function updateExpense(id, data) {
  const { expense_date, category, amount, description } = data;

  const current = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!current) {
    throw new Error('Expense entry not found');
  }

  let numAmount = current.amount;
  if (amount !== undefined) {
    numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Expense amount must be a positive number');
    }
  }

  db.prepare(`
    UPDATE expenses
    SET expense_date = COALESCE(?, expense_date),
        category = COALESCE(?, category),
        amount = ?,
        description = COALESCE(?, description)
    WHERE id = ?
  `).run(
    expense_date || current.expense_date,
    category ? category.trim() : current.category,
    numAmount,
    description !== undefined ? description.trim() : current.description,
    id
  );

  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

function deleteExpense(id) {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!expense) throw new Error('Expense not found');
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return true;
}

function getProfitReport(dateStr) {
  const targetDate = dateStr || getFormattedDate();
  const sales = getDailySales(targetDate);
  const expensesData = getExpensesByDate(targetDate);

  const totalSales = sales.total_sales;
  const hasExpenses = expensesData.has_expenses;
  const totalExpenses = expensesData.total_expenses;

  let netProfit = null;
  let profitMargin = null;
  let statusMessage = '';

  if (!hasExpenses) {
    netProfit = null;
    profitMargin = null;
    statusMessage = 'Expenses not recorded for this date. Profit is marked as unavailable to avoid false 100% margin assumptions.';
  } else {
    netProfit = Math.round((totalSales - totalExpenses) * 100) / 100;
    profitMargin = totalSales > 0 ? Math.round(((netProfit / totalSales) * 100) * 10) / 10 : 0;
    statusMessage = netProfit >= 0 ? 'Profitable day' : 'Operating at a loss for this date';
  }

  return {
    date: targetDate,
    total_sales: totalSales,
    total_bills: sales.total_bills,
    total_items_sold: sales.total_items_sold,
    has_expenses: hasExpenses,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    profit_margin: profitMargin,
    status_message: statusMessage,
    expenses: expensesData.expenses,
    category_summary: expensesData.category_summary,
    expense_categories: EXPENSE_CATEGORIES
  };
}

module.exports = {
  EXPENSE_CATEGORIES,
  getExpensesByDate,
  addExpense,
  updateExpense,
  deleteExpense,
  getProfitReport
};

