const { db } = require('./database');
const { getFormattedDate } = require('./bills');

function getDailySales(dateStr) {
  const targetDate = dateStr || getFormattedDate();

  // Exclude cancelled bills!
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(b.final_amount), 0) as total_sales,
      COALESCE(SUM(b.subtotal), 0) as total_subtotal,
      COALESCE(SUM(b.discount), 0) as total_discount,
      COUNT(b.id) as total_bills
    FROM bills b
    WHERE b.bill_date = ? AND b.status = 'completed'
  `).get(targetDate);

  const itemsSold = db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) as total_items_sold
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    WHERE b.bill_date = ? AND b.status = 'completed'
  `).get(targetDate);

  const totalSales = Math.round(Number(stats.total_sales) * 100) / 100;
  const totalBills = Number(stats.total_bills);
  const totalItemsSold = Number(itemsSold.total_items_sold);
  const averageBill = totalBills > 0 ? Math.round((totalSales / totalBills) * 100) / 100 : 0;

  // Breakdown of bills for the selected day
  const bills = db.prepare(`
    SELECT b.id, b.bill_number, b.bill_time, b.customer_mobile, b.customer_name,
           b.subtotal, b.discount, b.final_amount, b.payment_mode, b.status,
           COUNT(bi.id) as item_count,
           SUM(bi.quantity) as items_qty
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE b.bill_date = ? AND b.status = 'completed'
    GROUP BY b.id
    ORDER BY b.id ASC
  `).all(targetDate);

  // Payment mode breakdown
  const paymentBreakdown = db.prepare(`
    SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(final_amount), 0) as total
    FROM bills
    WHERE bill_date = ? AND status = 'completed'
    GROUP BY payment_mode
  `).all(targetDate);

  // Top selling items for this date
  const topItems = db.prepare(`
    SELECT bi.item_name, bi.item_code, SUM(bi.quantity) as quantity_sold, SUM(bi.line_total) as revenue
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    WHERE b.bill_date = ? AND b.status = 'completed'
    GROUP BY bi.item_name, bi.item_code
    ORDER BY quantity_sold DESC
    LIMIT 5
  `).all(targetDate);

  return {
    date: targetDate,
    total_sales: totalSales,
    total_subtotal: Math.round(Number(stats.total_subtotal) * 100) / 100,
    total_discount: Math.round(Number(stats.total_discount) * 100) / 100,
    total_bills: totalBills,
    total_items_sold: totalItemsSold,
    average_bill: averageBill,
    bills,
    payment_breakdown: paymentBreakdown,
    top_items: topItems
  };
}

function getSalesRangeSummary(days = 7) {
  // Returns summary for the last N days
  const rows = db.prepare(`
    SELECT
      b.bill_date,
      COALESCE(SUM(b.final_amount), 0) as total_sales,
      COUNT(b.id) as total_bills,
      COALESCE(SUM(bi.quantity), 0) as total_items
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE b.status = 'completed'
    GROUP BY b.bill_date
    ORDER BY b.bill_date DESC
    LIMIT ?
  `).all(days);

  return rows.reverse();
}

module.exports = {
  getDailySales,
  getSalesRangeSummary
};

