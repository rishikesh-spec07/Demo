// Dashboard Views & Dynamic Date Calculations (Section 3)

async function loadDashboardData() {
  const targetDate = State.selectedDate || getTodayDateStr();

  try {
    const res = await API.getDailySales(targetDate);
    if (res && res.sales) {
      renderDashboard(res.sales);
    }
  } catch (err) {
    console.error('Failed to load dashboard sales data:', err);
  }
}

function renderDashboard(sales) {
  // Update Stat Cards (Section 3)
  const totalSalesEl = document.getElementById('dash-total-sales');
  const totalBillsEl = document.getElementById('dash-total-bills');
  const itemsSoldEl = document.getElementById('dash-items-sold');
  const avgBillEl = document.getElementById('dash-avg-bill');
  const dateSubEl = document.getElementById('dash-sales-date-sub');
  const badgeEl = document.getElementById('dash-bill-count-badge');

  if (totalSalesEl) totalSalesEl.textContent = formatCurrency(sales.total_sales);
  if (totalBillsEl) totalBillsEl.textContent = sales.total_bills;
  if (itemsSoldEl) itemsSoldEl.textContent = sales.total_items_sold;
  if (avgBillEl) avgBillEl.textContent = formatCurrency(sales.average_bill);
  if (dateSubEl) dateSubEl.textContent = `Date: ${formatDateDisplay(sales.date)}`;
  if (badgeEl) badgeEl.textContent = `${sales.total_bills} Bills`;

  // Render Recent Bills for this date
  const tbody = document.getElementById('dash-recent-bills-tbody');
  if (tbody) {
    if (!sales.bills || sales.bills.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
            No bills generated yet for ${formatDateDisplay(sales.date)}.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = sales.bills.slice().reverse().map(bill => `
        <tr>
          <td>
            <strong>${escapeHtml(bill.bill_number)}</strong>
          </td>
          <td style="color: var(--text-muted);">${escapeHtml(bill.bill_time)}</td>
          <td>${bill.customer_mobile ? escapeHtml(bill.customer_mobile) : '<span style="color: var(--text-light);">—</span>'}</td>
          <td>${bill.items_qty || bill.item_count} items</td>
          <td>
            <span class="status-pill ${bill.payment_mode === 'Cash' ? 'warning' : 'completed'}">
              ${escapeHtml(bill.payment_mode)}
            </span>
          </td>
          <td style="font-weight: 700; color: #059669;">
            ${formatCurrency(bill.final_amount)}
          </td>
          <td>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="viewBillDetails(${bill.id})">
                Receipt
              </button>
              <a class="btn btn-sm btn-whatsapp" href="${buildWaUrl(bill.customer_mobile, bill)}" target="_blank" rel="noopener" title="Open directly in WhatsApp">
                💬
              </a>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  // Render Top Selling Items
  const topItemsContainer = document.getElementById('dash-top-items-container');
  if (topItemsContainer) {
    if (!sales.top_items || sales.top_items.length === 0) {
      topItemsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No items sold on this date.</div>';
    } else {
      topItemsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${sales.top_items.map((item, idx) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 700; color: var(--primary-dark); width: 20px;">#${idx + 1}</span>
                <div>
                  <div style="font-weight: 600; font-size: 13px;">${escapeHtml(item.item_name)}</div>
                  <div style="font-size: 11px; color: var(--text-muted);">Code: #${item.item_code}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${item.quantity_sold} sold</div>
                <div style="font-size: 11px; color: var(--text-muted);">${formatCurrency(item.revenue)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // Render Payment Methods
  const paymentsContainer = document.getElementById('dash-payments-container');
  if (paymentsContainer) {
    if (!sales.payment_breakdown || sales.payment_breakdown.length === 0) {
      paymentsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No payments recorded on this date.</div>';
    } else {
      paymentsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${sales.payment_breakdown.map(p => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
              <div style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
                <span>${p.payment_mode === 'Cash' ? '💵' : p.payment_mode === 'UPI' ? '📱' : '💳'}</span>
                <span>${escapeHtml(p.payment_mode)}</span>
                <span style="font-size: 11px; color: var(--text-muted);">(${p.count} bills)</span>
              </div>
              <div style="font-weight: 700; color: #059669; font-size: 14px;">
                ${formatCurrency(p.total)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
}

async function viewBillDetails(billId) {
  try {
    const res = await API.getBillById(billId);
    if (res && res.bill) {
      showReceiptModal(res.bill);
    }
  } catch (err) {
    showToast(err.message || 'Failed to fetch bill details', 'error');
  }
}

