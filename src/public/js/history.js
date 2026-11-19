// Bill History & Previous Records (Section 8)

function initHistory() {
  setupHistoryEventListeners();
  loadHistoryData();
}

function setupHistoryEventListeners() {
  const searchInput = document.getElementById('history-search-input');
  const dateFilter = document.getElementById('history-date-filter');
  const statusFilter = document.getElementById('history-status-filter');
  const btnRefresh = document.getElementById('btn-refresh-history');

  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadHistoryData, 300);
    });
  }

  if (dateFilter) {
    dateFilter.addEventListener('change', loadHistoryData);
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', loadHistoryData);
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadHistoryData);
  }
}

async function loadHistoryData() {
  const searchInput = document.getElementById('history-search-input');
  const dateFilter = document.getElementById('history-date-filter');
  const statusFilter = document.getElementById('history-status-filter');
  const tbody = document.getElementById('history-bills-tbody');
  const countText = document.getElementById('history-count-text');

  if (!tbody) return;

  const params = {};
  if (searchInput && searchInput.value.trim()) {
    params.search = searchInput.value.trim();
  }

  if (dateFilter) {
    if (dateFilter.value === 'selected') {
      params.date = State.selectedDate || getTodayDateStr();
    } else if (dateFilter.value === 'today') {
      params.date = getTodayDateStr();
    } else if (dateFilter.value === 'yesterday') {
      params.date = getYesterdayDateStr();
    }
  }

  if (statusFilter && statusFilter.value) {
    params.status = statusFilter.value;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">
        Loading transaction records...
      </td>
    </tr>
  `;

  try {
    const res = await API.getBills(params);
    if (!res || !res.bills || res.bills.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px;">
            No bills found matching the selected filters.
          </td>
        </tr>
      `;
      if (countText) countText.textContent = 'Showing 0 bills';
      return;
    }

    if (countText) {
      countText.textContent = `Showing ${res.bills.length} of ${res.total} bills`;
    }

    tbody.innerHTML = res.bills.map(bill => `
      <tr style="${bill.status === 'cancelled' ? 'opacity: 0.65; background-color: #fef2f2;' : ''}">
        <td>
          <strong>${escapeHtml(bill.bill_number)}</strong>
        </td>
        <td>
          <div>${escapeHtml(bill.bill_date)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(bill.bill_time)}</div>
        </td>
        <td>
          ${bill.customer_mobile ? `<span>📱 ${escapeHtml(bill.customer_mobile)}</span>` : '<span style="color: var(--text-light);">—</span>'}
          ${bill.customer_name ? `<div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(bill.customer_name)}</div>` : ''}
        </td>
        <td>
          <span style="font-weight: 600;">${bill.total_quantity || bill.item_count || 1}</span>
          <span style="font-size: 11px; color: var(--text-muted);">items</span>
        </td>
        <td style="color: var(--text-muted);">${formatCurrency(bill.subtotal)}</td>
        <td style="color: var(--text-muted);">${bill.discount > 0 ? '-' + formatCurrency(bill.discount) : '₹0.00'}</td>
        <td style="font-weight: 700; color: ${bill.status === 'cancelled' ? 'var(--text-muted)' : '#059669'};">
          ${formatCurrency(bill.final_amount)}
        </td>
        <td>
          <span class="status-pill ${bill.payment_mode === 'Cash' ? 'warning' : 'completed'}">
            ${escapeHtml(bill.payment_mode)}
          </span>
        </td>
        <td>
          <span class="status-pill ${bill.status}">
            ${escapeHtml(bill.status)}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="viewBillDetails(${bill.id})" title="View and Print Receipt">
              Receipt
            </button>
            <a class="btn btn-sm btn-whatsapp" href="${buildWaUrl(bill.customer_mobile, bill)}" target="_blank" rel="noopener" title="Open directly in WhatsApp">
              💬
            </a>
            ${bill.status === 'completed' ? `
              <button type="button" class="btn btn-danger btn-sm" onclick="promptCancelBill(${bill.id}, '${escapeHtml(bill.bill_number)}')" title="Cancel Bill">
                Void
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message || 'Failed to load bill history', 'error');
  }
}

async function shareBillFromHistory(billId) {
  try {
    const res = await API.getBillById(billId);
    if (res && res.bill) {
      State.activeReceiptBill = res.bill;
      shareReceiptOnWhatsApp(res.bill.customer_mobile);
    }
  } catch (err) {
    showToast(err.message || 'Failed to load bill for WhatsApp share', 'error');
  }
}
window.shareBillFromHistory = shareBillFromHistory;

async function promptCancelBill(billId, billNumber) {
  const reason = prompt(`Are you sure you want to void/cancel Bill ${billNumber}?\nCancelled bills are excluded from daily sales calculations.\n\nEnter reason for cancellation:`, 'Customer cancellation / Order correction');

  if (reason === null) return;

  try {
    await API.cancelBill(billId, reason || 'Cancelled by owner');
    showToast(`Bill ${billNumber} has been cancelled`, 'info');
    loadHistoryData();
    if (window.loadDashboardData) window.loadDashboardData();
  } catch (err) {
    showToast(err.message || 'Failed to cancel bill', 'error');
  }
}
