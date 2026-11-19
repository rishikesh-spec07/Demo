// Daily Sales View (Section 7)

async function loadDailySalesView() {
  const targetDate = State.selectedDate || getTodayDateStr();

  const totalRevEl = document.getElementById('sales-total-revenue');
  const totalBillsEl = document.getElementById('sales-total-bills');
  const itemsSoldEl = document.getElementById('sales-items-sold');
  const avgValueEl = document.getElementById('sales-avg-value');
  const dateDisplayEl = document.getElementById('sales-date-display');
  const tbody = document.getElementById('sales-bills-tbody');

  if (dateDisplayEl) dateDisplayEl.textContent = `Date: ${formatDateDisplay(targetDate)}`;

  try {
    const res = await API.getDailySales(targetDate);
    if (!res || !res.sales) return;

    const sales = res.sales;

    if (totalRevEl) totalRevEl.textContent = formatCurrency(sales.total_sales);
    if (totalBillsEl) totalBillsEl.textContent = sales.total_bills;
    if (itemsSoldEl) itemsSoldEl.textContent = sales.total_items_sold;
    if (avgValueEl) avgValueEl.textContent = formatCurrency(sales.average_bill);

    if (tbody) {
      if (!sales.bills || sales.bills.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">
              No completed bills recorded on ${formatDateDisplay(targetDate)}.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = sales.bills.map(bill => `
        <tr>
          <td>
            <strong>${escapeHtml(bill.bill_number)}</strong>
          </td>
          <td style="color: var(--text-muted);">${escapeHtml(bill.bill_time)}</td>
          <td>${bill.customer_mobile ? escapeHtml(bill.customer_mobile) : '<span style="color: var(--text-light);">—</span>'}</td>
          <td>
            <span style="font-weight: 600;">${bill.items_qty || bill.item_count}</span> units
          </td>
          <td>
            <span class="status-pill ${bill.payment_mode === 'Cash' ? 'warning' : 'completed'}">
              ${escapeHtml(bill.payment_mode)}
            </span>
          </td>
          <td style="font-weight: 700; color: #059669; font-size: 14px;">
            ${formatCurrency(bill.final_amount)}
          </td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" onclick="viewBillDetails(${bill.id})">
              Receipt
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message || 'Failed to load daily sales', 'error');
  }
}

