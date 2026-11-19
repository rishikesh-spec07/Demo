// Customer Directory & Owner's Customer List Management

function initCustomersView() {
  setupCustomerEventListeners();
  loadCustomersData();
}

function setupCustomerEventListeners() {
  const searchInput = document.getElementById('customers-search-input');
  const btnRefresh = document.getElementById('btn-refresh-customers');

  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadCustomersData, 300);
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadCustomersData);
  }
}

async function loadCustomersData() {
  const searchInput = document.getElementById('customers-search-input');
  const tbody = document.getElementById('customers-tbody');
  const countBadge = document.getElementById('customers-count-badge');
  const totalCustEl = document.getElementById('cust-stat-total');
  const repeatCustEl = document.getElementById('cust-stat-repeat');
  const spendCustEl = document.getElementById('cust-stat-spend');

  if (!tbody) return;

  const search = searchInput ? searchInput.value.trim() : '';

  try {
    const res = await API.getCustomers({ search });
    if (!res || !res.customers) return;

    if (totalCustEl) totalCustEl.textContent = res.stats?.total_customers || 0;
    if (repeatCustEl) repeatCustEl.textContent = res.stats?.repeat_customers || 0;
    if (spendCustEl) spendCustEl.textContent = formatCurrency(res.stats?.total_customer_spend || 0);
    if (countBadge) countBadge.textContent = `${res.customers.length} Customers`;

    if (res.customers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px;">
            No customers recorded yet. When you enter a mobile number during billing, the customer is automatically saved here!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = res.customers.map((c, idx) => `
      <tr>
        <td>
          <span style="font-weight: 700; color: var(--primary-dark);">#${idx + 1}</span>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 14px; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
            <span>📱 +91 ${escapeHtml(c.phone)}</span>
            ${c.total_bills > 1 ? '<span class="status-pill completed" style="font-size: 10px;">Regular</span>' : ''}
          </div>
          ${c.name ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(c.name)}</div>` : ''}
        </td>
        <td>
          <span style="font-weight: 700; font-size: 13px;">${c.total_bills}</span> orders
        </td>
        <td style="font-weight: 700; color: #059669; font-size: 14px;">
          ${formatCurrency(c.total_spent)}
        </td>
        <td style="color: var(--text-muted); font-size: 12px;">
          ${c.last_visit_date ? formatDateDisplay(c.last_visit_date) : '—'}
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button type="button" class="btn btn-sm btn-whatsapp" onclick="openCustomerWhatsApp('${c.phone}', '${escapeHtml(c.name || '')}')" title="Message on WhatsApp">
              💬 WhatsApp
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="viewCustomerBills('${c.phone}', '${escapeHtml(c.name || '')}')" title="View Customer's Bills">
              🧾 Orders (${c.total_bills})
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message || 'Failed to load customers', 'error');
  }
}

function openCustomerWhatsApp(phone, name) {
  let cleanNumber = phone.replace(/[^0-9]/g, '');
  if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;

  const cafeName = State.currentUser?.cafe_name || 'Cafe Delight';
  const greeting = name ? `Hello ${name}!` : 'Hello!';
  const msg = `${greeting} Thank you for visiting *${cafeName}*! We appreciate your patronage. Let us know if you need anything! ☕`;

  window.open(`https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(msg)}`, '_blank');
}
window.openCustomerWhatsApp = openCustomerWhatsApp;

async function viewCustomerBills(phone, name) {
  try {
    const res = await API.getCustomerBills(phone);
    if (!res || !res.bills) return;

    const modalTitle = document.getElementById('cust-bills-modal-title');
    const tbody = document.getElementById('cust-bills-tbody');

    if (modalTitle) modalTitle.textContent = `Order History for +91 ${phone} ${name ? '(' + name + ')' : ''}`;

    if (tbody) {
      if (res.bills.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No bills found.</td></tr>';
      } else {
        tbody.innerHTML = res.bills.map(b => `
          <tr>
            <td><strong>${escapeHtml(b.bill_number)}</strong></td>
            <td>${escapeHtml(b.bill_date)} ${escapeHtml(b.bill_time)}</td>
            <td>${b.total_quantity || b.item_count} items</td>
            <td style="font-weight: 700; color: #059669;">${formatCurrency(b.final_amount)}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm" onclick="viewBillDetails(${b.id})">
                Receipt
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    openModal('modal-customer-bills');
  } catch (err) {
    showToast(err.message || 'Failed to fetch customer bills', 'error');
  }
}
window.viewCustomerBills = viewCustomerBills;

