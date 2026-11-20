// POS Core Billing Screen Logic (Section 4, 5, 6) & WhatsApp Sharing

let posMobileView = 'menu'; // 'menu' | 'bill'

function initPOS() {
  generateNewIdempotencyKey();
  setupPOSEventListeners();
  renderPOSCategories();
  renderPOSMenuItems();
  renderPOSCart();
  setPosMobileView('menu');
  updatePOSOwnerDisplay();
}

function updatePOSOwnerDisplay() {
  const posSenderDisplay = document.getElementById('pos-owner-sender-display');
  if (posSenderDisplay) {
    const ownerNumber = State.currentUser?.owner_whatsapp || State.currentUser?.phone || '+91 98765 43210';
    posSenderDisplay.textContent = ownerNumber;
  }
}
window.updatePOSOwnerDisplay = updatePOSOwnerDisplay;

function generateNewIdempotencyKey() {
  State.idempotencyKey = 'pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

// -------------------------------------------------------------
// Mobile View Switching (Menu vs Bill)
// -------------------------------------------------------------
function setPosMobileView(view) {
  posMobileView = view;
  const container = document.getElementById('pos-container');
  const btnMenu = document.getElementById('pos-tab-menu-btn');
  const btnBill = document.getElementById('pos-tab-bill-btn');

  if (container) {
    container.classList.remove('mobile-view-menu', 'mobile-view-bill');
    container.classList.add(`mobile-view-${view}`);
  }

  if (btnMenu) btnMenu.classList.toggle('active', view === 'menu');
  if (btnBill) btnBill.classList.toggle('active', view === 'bill');

  if (view === 'bill') {
    const codeInput = document.getElementById('pos-code-input');
    if (codeInput) setTimeout(() => codeInput.focus(), 150);
  }
}
window.setPosMobileView = setPosMobileView;

function setupPOSEventListeners() {
  // Method 1: Code Input - Live Preview & Enter key to Add
  const codeInput = document.getElementById('pos-code-input');
  const qtyInput = document.getElementById('pos-qty-input');
  const btnAddCode = document.getElementById('btn-add-code-item');

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const code = codeInput.value.trim();
      updateCodePreview(code);
    });

    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addItemByCode();
      }
    });
  }

  if (qtyInput) {
    qtyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addItemByCode();
      }
    });
  }

  if (btnAddCode) {
    btnAddCode.addEventListener('click', addItemByCode);
  }

  // Customer Mobile Single-Entry Lookup (Recognize repeat customer & auto-fill)
  const custMobileInput = document.getElementById('pos-customer-mobile');
  const custNameInput = document.getElementById('pos-customer-name');
  const custBadge = document.getElementById('pos-customer-badge');
  let custLookupTimer = null;

  if (custMobileInput) {
    custMobileInput.addEventListener('input', () => {
      clearTimeout(custLookupTimer);
      const raw = custMobileInput.value.replace(/[^0-9]/g, '');
      if (raw.length >= 10) {
        custLookupTimer = setTimeout(async () => {
          try {
            const res = await API.lookupCustomer(raw);
            if (res && res.customer) {
              const c = res.customer;
              if (custNameInput && !custNameInput.value.trim() && c.name) {
                custNameInput.value = c.name;
              }
              if (custBadge) {
                custBadge.style.display = 'flex';
                custBadge.innerHTML = `
                  <span class="cust-badge-icon">⭐</span>
                  <div class="cust-badge-text">
                    <strong>Regular Customer</strong>: ${escapeHtml(c.name || 'Valued Guest')} • 
                    <strong>${c.total_bills}</strong> past order${c.total_bills > 1 ? 's' : ''} (Spent ${formatCurrency(c.total_spent)})
                  </div>
                `;
              }
            } else {
              if (custBadge) custBadge.style.display = 'none';
            }
          } catch (e) {
            if (custBadge) custBadge.style.display = 'none';
          }
        }, 200);
      } else {
        if (custBadge) custBadge.style.display = 'none';
      }
      refreshWaLink();
    });
  }

  // Method 2: Menu Search Input
  const searchInput = document.getElementById('pos-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      State.posSearchQuery = e.target.value.toLowerCase().trim();
      renderPOSMenuItems();
    });
  }

  // Discount Input
  const discountInput = document.getElementById('pos-discount-input');
  if (discountInput) {
    discountInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      State.discount = Math.max(0, val);
      updatePOSTotals();
    });
  }

  // Payment Mode Selector
  const modeGroup = document.getElementById('pos-payment-mode-group');
  if (modeGroup) {
    modeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.payment-mode-btn');
      if (!btn) return;
      modeGroup.querySelectorAll('.payment-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.paymentMode = btn.dataset.mode || 'Cash';
      refreshWaLink();
    });
  }

  // Direct WhatsApp Button (Billbook Reference)
  const waBtn = document.getElementById('btn-pos-wa-bill');
  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      if (State.cart.length === 0) {
        e.preventDefault();
        showToast('Add at least one food item first', 'warning');
        return;
      }

      refreshWaLink();

      // Save bill in background as WhatsApp tab opens directly
      setTimeout(() => {
        generateBill({ fromWhatsAppClick: true });
        showToast('Bill saved and opened in WhatsApp', 'success');
      }, 80);
    });
  }

  // Generate Bill Button (Save Bill Only)
  const btnGenerate = document.getElementById('btn-generate-bill');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', () => generateBill({ fromWhatsAppClick: false }));
  }

  // Clear Bill Button
  const btnClear = document.getElementById('btn-clear-bill');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (State.cart.length === 0) return;
      if (confirm('Are you sure you want to clear the current bill?')) {
        resetPOS();
        showToast('Bill cleared', 'info');
      }
    });
  }
}

// -------------------------------------------------------------
// Method 1: Add by Code Implementation
// -------------------------------------------------------------
function updateCodePreview(code) {
  const previewEl = document.getElementById('pos-code-preview');
  if (!previewEl) return;

  if (!code) {
    previewEl.innerHTML = '<span style="color: var(--text-light);">Type a food code (e.g. 11, 12, 13)</span>';
    return;
  }

  const item = State.menuItems.find(m => String(m.code).toLowerCase() === code.toLowerCase() && m.is_active);
  if (item) {
    previewEl.innerHTML = `
      <span style="color: #059669; font-weight: 700;">✓ ${escapeHtml(item.name)}</span>
      <span style="color: var(--primary-dark); font-weight: 700;">• ${formatCurrency(item.price)}</span>
      <span style="color: var(--text-muted); font-size: 11px;">(${escapeHtml(item.category_name || 'General')})</span>
    `;
  } else {
    previewEl.innerHTML = `<span style="color: var(--danger);">✗ Code "${escapeHtml(code)}" not found in menu</span>`;
  }
}

async function addItemByCode() {
  const codeInput = document.getElementById('pos-code-input');
  const qtyInput = document.getElementById('pos-qty-input');
  if (!codeInput) return;

  const code = codeInput.value.trim();
  if (!code) {
    showToast('Please enter a food code (e.g. 11)', 'warning');
    codeInput.focus();
    return;
  }

  const qty = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;
  if (qty <= 0) {
    showToast('Quantity must be at least 1', 'warning');
    return;
  }

  let item = State.menuItems.find(m => String(m.code).toLowerCase() === code.toLowerCase());

  if (!item) {
    try {
      const res = await API.getMenuItemByCode(code);
      if (res && res.item) {
        item = res.item;
      }
    } catch (err) {
      showToast(`Food item with code "${code}" not found`, 'error');
      codeInput.select();
      return;
    }
  }

  if (!item) {
    showToast(`Food code "${code}" does not exist`, 'error');
    codeInput.select();
    return;
  }

  if (!item.is_active) {
    showToast(`Item "${item.name}" is currently marked inactive`, 'warning');
    return;
  }

  addToCart(item, qty);

  codeInput.value = '';
  if (qtyInput) qtyInput.value = '1';
  updateCodePreview('');
  codeInput.focus();
}

// -------------------------------------------------------------
// Method 2: Visual Menu Selection
// -------------------------------------------------------------
const categoryIcons = {
  'all': '🍽️',
  'All Items': '🍽️',
  'Snacks': '🍟',
  'Fast Food': '🍔',
  'Beverages': '☕',
  'South Indian': '🥘',
  'Combos & Meals': '🍱',
  'Desserts': '🍰'
};

function renderPOSCategories() {
  const container = document.getElementById('pos-category-tabs');
  if (!container) return;

  const activeCount = State.menuItems.filter(i => i.is_active).length;
  let html = `
    <button type="button" class="pos-cat-tab ${State.posCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">
      <span class="cat-pill-icon">🍽️</span>
      <span>All Items</span>
      <span class="cat-pill-count">${activeCount}</span>
    </button>
  `;

  State.categories.forEach(cat => {
    const count = State.menuItems.filter(i => i.category_id === cat.id && i.is_active).length;
    const isActive = String(State.posCategoryFilter) === String(cat.id);
    const icon = categoryIcons[cat.name] || '🍴';
    html += `
      <button type="button" class="pos-cat-tab ${isActive ? 'active' : ''}" data-cat="${cat.id}">
        <span class="cat-pill-icon">${icon}</span>
        <span>${escapeHtml(cat.name)}</span>
        <span class="cat-pill-count">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  // Update mobile tab count
  const mobileMenuCount = document.getElementById('mobile-menu-item-count');
  if (mobileMenuCount) mobileMenuCount.textContent = activeCount;

  const availableCountEl = document.getElementById('pos-available-count');
  if (availableCountEl) {
    availableCountEl.textContent = `${activeCount} items available`;
  }

  container.querySelectorAll('.pos-cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.pos-cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.posCategoryFilter = btn.dataset.cat;
      renderPOSMenuItems();
    });
  });
}

function renderPOSMenuItems() {
  const grid = document.getElementById('pos-items-grid');
  if (!grid) return;

  let items = State.menuItems.filter(i => i.is_active);

  if (State.posCategoryFilter !== 'all') {
    items = items.filter(i => String(i.category_id) === String(State.posCategoryFilter));
  }

  if (State.posSearchQuery) {
    const q = State.posSearchQuery;
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      String(i.code).toLowerCase().includes(q) ||
      (i.category_name && i.category_name.toLowerCase().includes(q))
    );
  }

  const availableCountEl = document.getElementById('pos-available-count');
  if (availableCountEl) {
    availableCountEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'} available`;
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px;">
        <div style="font-size: 24px; margin-bottom: 6px;">🍽️</div>
        <div>No matching food items found</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => {
    const cartIdx = State.cart.findIndex(c => c.id === item.id || String(c.code) === String(item.code));
    const cartItem = cartIdx > -1 ? State.cart[cartIdx] : null;

    return `
      <article class="food-card ${cartItem ? 'selected' : ''}" data-id="${item.id}" onclick="onFoodCardClick(${item.id})">
        <div class="food-card-top">
          <span class="item-code-badge" title="Food Code">#${escapeHtml(item.code)}</span>
          <span class="veg-badge" title="Vegetarian"><span class="veg-dot"></span></span>
        </div>
        <div class="food-card-name">${escapeHtml(item.name)}</div>
        <div class="food-card-category">${escapeHtml(item.category_name || 'General')}</div>
        <div class="food-card-bottom">
          <b class="food-card-price">${formatCurrency(item.price)}</b>
          ${cartItem ? `
            <div class="food-card-stepper" onclick="event.stopPropagation()">
              <button type="button" class="stepper-btn-mini" onclick="stepCartItemQuantity(${cartIdx}, -1)" title="Decrease">−</button>
              <span class="stepper-qty-mini">${cartItem.quantity}</span>
              <button type="button" class="stepper-btn-mini" onclick="stepCartItemQuantity(${cartIdx}, 1)" title="Increase">+</button>
            </div>
          ` : `
            <button type="button" class="food-card-add-icon" onclick="event.stopPropagation(); onFoodCardClick(${item.id})" title="Add to bill">+</button>
          `}
        </div>
      </article>
    `;
  }).join('');
}

function onFoodCardClick(itemId) {
  const item = State.menuItems.find(i => i.id === itemId);
  if (!item) return;
  addToCart(item, 1);
}

// -------------------------------------------------------------
// Cart Management & Table Operations
// -------------------------------------------------------------
function addToCart(item, qtyToAdd = 1) {
  const existingIndex = State.cart.findIndex(c => c.id === item.id || String(c.code) === String(item.code));

  if (existingIndex > -1) {
    State.cart[existingIndex].quantity += qtyToAdd;
    State.cart[existingIndex].line_total = Math.round(State.cart[existingIndex].price * State.cart[existingIndex].quantity * 100) / 100;
  } else {
    State.cart.push({
      id: item.id,
      code: String(item.code),
      name: item.name,
      price: parseFloat(item.price),
      quantity: qtyToAdd,
      line_total: Math.round(parseFloat(item.price) * qtyToAdd * 100) / 100
    });
  }

  renderPOSCart();
  showToast(`Added: ${item.name} (${qtyToAdd > 1 ? '+' + qtyToAdd : ''})`, 'info', 1200);
}

function updateCartItemQuantity(index, newQty) {
  const qty = parseInt(newQty, 10);
  if (isNaN(qty) || qty <= 0) {
    removeCartItem(index);
    return;
  }

  State.cart[index].quantity = qty;
  State.cart[index].line_total = Math.round(State.cart[index].price * qty * 100) / 100;
  renderPOSCart();
}

function stepCartItemQuantity(index, delta) {
  if (!State.cart[index]) return;
  const newQty = State.cart[index].quantity + delta;
  if (newQty <= 0) {
    removeCartItem(index);
  } else {
    updateCartItemQuantity(index, newQty);
  }
}

function removeCartItem(index) {
  if (!State.cart[index]) return;
  const removedName = State.cart[index].name;
  State.cart.splice(index, 1);
  renderPOSCart();
  showToast(`Removed: ${removedName}`, 'info', 1500);
}

function renderPOSCart() {
  const tbody = document.getElementById('pos-cart-tbody');
  const emptyState = document.getElementById('pos-empty-cart-state');
  const btnGenerate = document.getElementById('btn-generate-bill');
  const mobileCartBar = document.getElementById('pos-mobile-cart-bar');
  const mobileCartCount = document.getElementById('mobile-cart-item-count');
  const mobileBarQty = document.getElementById('mobile-bar-qty');
  const mobileBarTotal = document.getElementById('mobile-bar-total');
  const headerQtyBadge = document.getElementById('bill-header-qty-badge');

  if (!tbody) return;

  const totalQty = State.cart.reduce((sum, item) => sum + item.quantity, 0);
  let subtotal = State.cart.reduce((sum, item) => sum + item.line_total, 0);
  subtotal = Math.round(subtotal * 100) / 100;

  if (mobileCartCount) mobileCartCount.textContent = totalQty;
  if (headerQtyBadge) headerQtyBadge.textContent = `${totalQty} item${totalQty === 1 ? '' : 's'}`;

  // Handle empty state
  if (State.cart.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    if (btnGenerate) btnGenerate.disabled = true;
    if (mobileCartBar) mobileCartBar.style.display = 'none';
    updatePOSTotals();
    renderPOSMenuItems();
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (btnGenerate) btnGenerate.disabled = false;

  // Show floating cart bar on mobile if items exist
  if (mobileCartBar) {
    mobileCartBar.style.display = 'flex';
    if (mobileBarQty) mobileBarQty.textContent = `${totalQty} item${totalQty > 1 ? 's' : ''}`;
    if (mobileBarTotal) mobileBarTotal.textContent = formatCurrency(subtotal);
  }

  tbody.innerHTML = State.cart.map((item, idx) => `
    <tr>
      <td>
        <span class="item-code-badge">#${escapeHtml(item.code)}</span>
      </td>
      <td>
        <strong style="color: var(--text-main); font-size: 13px;">${escapeHtml(item.name)}</strong>
      </td>
      <td style="text-align: center;">
        <div class="table-qty-stepper">
          <button type="button" class="stepper-btn" onclick="stepCartItemQuantity(${idx}, -1)" title="Decrease">−</button>
          <input type="number" class="stepper-value" value="${item.quantity}" min="1" max="99" onchange="updateCartItemQuantity(${idx}, this.value)">
          <button type="button" class="stepper-btn" onclick="stepCartItemQuantity(${idx}, 1)" title="Increase">+</button>
        </div>
      </td>
      <td style="text-align: right; color: var(--text-muted); font-size: 11px;">
        ${formatCurrency(item.price)}
      </td>
      <td style="text-align: right; font-weight: 700; color: var(--text-main);">
        ${formatCurrency(item.line_total)}
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-remove-row" onclick="removeCartItem(${idx})" title="Remove item">✕</button>
      </td>
    </tr>
  `).join('');

  updatePOSTotals();
  renderPOSMenuItems();
}

function updatePOSTotals() {
  const subtotalValEl = document.getElementById('pos-subtotal-val');
  const finalAmountValEl = document.getElementById('pos-final-amount-val');
  const btnPillEl = document.getElementById('btn-generate-amount-pill');

  let subtotal = State.cart.reduce((sum, item) => sum + item.line_total, 0);
  subtotal = Math.round(subtotal * 100) / 100;

  const discount = Math.min(subtotal, Math.max(0, State.discount || 0));
  const finalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  if (subtotalValEl) subtotalValEl.textContent = formatCurrency(subtotal);
  if (finalAmountValEl) finalAmountValEl.textContent = formatCurrency(finalAmount);
  if (btnPillEl) btnPillEl.textContent = formatCurrency(finalAmount);

  refreshWaLink();
}

// -------------------------------------------------------------
// Finalize & Generate Bill (Section 6 & Billbook Reference)
// -------------------------------------------------------------
async function generateBill(options = {}) {
  if (State.isGeneratingBill) return;

  if (State.cart.length === 0) {
    showToast('Cannot generate bill with 0 items', 'warning');
    return;
  }

  const btnGenerate = document.getElementById('btn-generate-bill');
  const mobileInput = document.getElementById('pos-customer-mobile');
  const nameInput = document.getElementById('pos-customer-name');

  const customerMobile = mobileInput ? mobileInput.value.trim() : '';
  const customerName = nameInput ? nameInput.value.trim() : '';

  State.isGeneratingBill = true;
  if (btnGenerate) {
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = '<span>⏳ Saving Bill...</span>';
  }

  try {
    const payload = {
      bill_date: State.selectedDate || getTodayDateStr(),
      bill_time: new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      customer_mobile: customerMobile,
      customer_name: customerName,
      items: State.cart,
      discount: State.discount || 0,
      payment_mode: State.paymentMode || 'Cash',
      idempotency_key: State.idempotencyKey
    };

    const res = await API.createBill(payload);

    if (res && res.bill) {
      showToast(`Bill ${res.bill.bill_number} saved successfully!`, 'success');

      // Display receipt in modal with direct universal WhatsApp action link
      showReceiptModal(res.bill, Boolean(options.fromWhatsAppClick));

      resetPOS();

      if (window.loadDashboardData) {
        window.loadDashboardData();
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to generate bill', 'error');
  } finally {
    State.isGeneratingBill = false;
    if (btnGenerate) {
      btnGenerate.disabled = State.cart.length === 0;
      updatePOSTotals();
      btnGenerate.innerHTML = `
        <span>⚡ Save Bill Only</span>
        <span id="btn-generate-amount-pill" style="background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: var(--radius-full); font-size: 13px;">₹0.00</span>
      `;
    }
  }
}

function resetPOS() {
  State.cart = [];
  State.discount = 0;
  generateNewIdempotencyKey();

  const mobileInput = document.getElementById('pos-customer-mobile');
  const nameInput = document.getElementById('pos-customer-name');
  const custBadge = document.getElementById('pos-customer-badge');
  const discountInput = document.getElementById('pos-discount-input');
  const codeInput = document.getElementById('pos-code-input');
  const qtyInput = document.getElementById('pos-qty-input');

  if (mobileInput) mobileInput.value = '';
  if (nameInput) nameInput.value = '';
  if (custBadge) custBadge.style.display = 'none';
  if (discountInput) discountInput.value = '0';
  if (codeInput) codeInput.value = '';
  if (qtyInput) qtyInput.value = '1';
  updateCodePreview('');

  renderPOSCart();
  refreshWaLink();
  setPosMobileView('menu');
  if (codeInput) codeInput.focus();
}

// -------------------------------------------------------------
// Thermal Receipt Display & WhatsApp Sharing (Referenced from Billbook.html & Figma)
// -------------------------------------------------------------
function showReceiptModal(bill, wasAutoSent = false) {
  State.activeReceiptBill = bill;

  // Header info
  const cafeNameEl = document.getElementById('rec-cafe-name');
  const cafeAddrEl = document.getElementById('rec-cafe-address');
  const cafePhoneEl = document.getElementById('rec-cafe-phone');
  const cafeGstinEl = document.getElementById('rec-cafe-gstin');
  const footerTextEl = document.getElementById('rec-footer-text');
  const ownerBadgeEl = document.getElementById('rec-owner-badge');

  if (cafeNameEl) cafeNameEl.textContent = (bill.cafe_name || State.currentUser?.cafe_name || 'Cafe Delight & Bistro').toUpperCase();
  if (cafeAddrEl) cafeAddrEl.textContent = bill.cafe_address || State.currentUser?.address || 'Shop 12, Food Court, Commercial Plaza';
  if (cafePhoneEl) cafePhoneEl.textContent = `Ph: ${bill.owner_whatsapp || bill.cafe_phone || State.currentUser?.owner_whatsapp || State.currentUser?.phone || '+91 98765 43210'}`;
  
  if (cafeGstinEl) {
    if (bill.cafe_gstin || State.currentUser?.gstin) {
      cafeGstinEl.style.display = 'block';
      cafeGstinEl.textContent = `GSTIN: ${bill.cafe_gstin || State.currentUser?.gstin}`;
    } else {
      cafeGstinEl.style.display = 'none';
    }
  }

  if (footerTextEl) {
    footerTextEl.textContent = bill.receipt_footer || State.currentUser?.receipt_footer || 'Thank you for visiting! Please come again.';
  }

  if (ownerBadgeEl) {
    const initials = (State.currentUser?.username || 'PT').substring(0, 2).toUpperCase();
    ownerBadgeEl.textContent = initials;
  }

  // Meta row
  const billNumEl = document.getElementById('rec-bill-number');
  const billTimeEl = document.getElementById('rec-bill-time');
  const billDateEl = document.getElementById('rec-bill-date');
  const payModeEl = document.getElementById('rec-payment-mode');
  const custRow = document.getElementById('rec-customer-row');
  const custMobileEl = document.getElementById('rec-customer-mobile');

  if (billNumEl) billNumEl.textContent = bill.bill_number;
  if (billTimeEl) billTimeEl.textContent = bill.bill_time;
  if (billDateEl) billDateEl.textContent = bill.bill_date;
  if (payModeEl) payModeEl.textContent = `Mode: ${bill.payment_mode || 'Cash'}`;

  if (custRow && custMobileEl) {
    if (bill.customer_mobile) {
      custRow.style.display = 'flex';
      custMobileEl.textContent = `+91 ${bill.customer_mobile}`;
    } else {
      custRow.style.display = 'none';
    }
  }

  // Items table
  const tbody = document.getElementById('rec-items-tbody');
  if (tbody && bill.items) {
    tbody.innerHTML = bill.items.map(i => `
      <tr>
        <td>${escapeHtml(i.item_name)}</td>
        <td style="text-align: center;">${i.quantity}</td>
        <td style="text-align: right;">${formatCurrency(i.price)}</td>
        <td style="text-align: right;">${formatCurrency(i.line_total)}</td>
      </tr>
    `).join('');
  }

  // Totals
  const subtotalEl = document.getElementById('rec-subtotal');
  const discountRow = document.getElementById('rec-discount-row');
  const discountEl = document.getElementById('rec-discount');
  const finalEl = document.getElementById('rec-final-amount');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(bill.subtotal);

  if (discountRow && discountEl) {
    if (bill.discount > 0) {
      discountRow.style.display = 'flex';
      discountEl.textContent = '-' + formatCurrency(bill.discount);
    } else {
      discountRow.style.display = 'none';
    }
  }

  if (finalEl) finalEl.textContent = formatCurrency(bill.final_amount);

  // Wire Direct WhatsApp Actions in the Receipt Modal (Top card + Bottom modal button)
  const sharePhoneInput = document.getElementById('rec-share-phone');
  const shareSendBtn = document.getElementById('rec-share-send-btn');
  const modalWaBtn = document.getElementById('btn-modal-whatsapp');

  const initialPhone = bill.customer_mobile || '';
  if (sharePhoneInput) {
    sharePhoneInput.value = initialPhone;
  }

  function syncModalWaLinks(phone) {
    const waUrl = buildWaUrl(phone, bill);
    if (shareSendBtn) shareSendBtn.href = waUrl;
    if (modalWaBtn) modalWaBtn.href = waUrl;
  }

  syncModalWaLinks(initialPhone);

  if (sharePhoneInput) {
    sharePhoneInput.oninput = (e) => {
      const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
      syncModalWaLinks(clean);
      if (custRow && custMobileEl) {
        if (clean) {
          custRow.style.display = 'flex';
          custMobileEl.textContent = `+91 ${clean}`;
        } else {
          custRow.style.display = 'none';
        }
      }
    };
  }

  openModal('modal-receipt');
}

// -------------------------------------------------------------
// WhatsApp Digital Bill Formatting & Link Generator (Billbook.html Reference)
// -------------------------------------------------------------
function formatBillForWhatsApp(bill) {
  const shop = (bill.cafe_name || State.currentUser?.cafe_name || 'Cafe Delight').toUpperCase();
  const dateStr = bill.bill_date || State.selectedDate || getTodayDateStr();
  const timeStr = bill.bill_time || '';
  const billNo = bill.bill_number || 'Draft';
  const ownerPhone = bill.owner_whatsapp || State.currentUser?.owner_whatsapp || bill.cafe_phone || State.currentUser?.phone || '';

  const lines = [
    `*${shop}*`,
    `Bill ${billNo} · ${dateStr} ${timeStr}`,
    ''
  ];

  if (bill.items && bill.items.length > 0) {
    for (const i of bill.items) {
      const name = i.item_name || i.name;
      const qty = i.quantity;
      const total = Number(i.line_total || (i.price * qty)).toFixed(2);
      lines.push(`${name} × ${qty} = ₹${total}`);
    }
  }

  lines.push('');
  if (bill.discount > 0) {
    lines.push(`Subtotal: ₹${Number(bill.subtotal).toFixed(2)}`);
    lines.push(`Discount: -₹${Number(bill.discount).toFixed(2)}`);
  }

  lines.push(`*Total: ₹${Number(bill.final_amount).toFixed(2)}*`);
  lines.push(`Payment: ${bill.payment_mode || 'Cash'}`);
  lines.push('');

  const footer = bill.receipt_footer || State.currentUser?.receipt_footer || 'Thank you! Visit again.';
  lines.push(footer);

  if (ownerPhone) {
    lines.push(`Owner / Inquiries: ${ownerPhone}`);
  }

  return lines.join('\n');
}
window.formatBillForWhatsApp = formatBillForWhatsApp;

function buildWaUrl(phone, bill) {
  const text = formatBillForWhatsApp(bill);
  let dg = String(phone || '').replace(/\D/g, '');
  if (dg.length === 10) {
    const cc = (State.currentUser?.country_code || '91').replace(/\D/g, '') || '91';
    dg = cc + dg;
  }
  const base = dg.length >= 10 ? `https://wa.me/${dg}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}
window.buildWaUrl = buildWaUrl;

function refreshWaLink() {
  const waBtn = document.getElementById('btn-pos-wa-bill');
  if (!waBtn) return;

  if (State.cart.length === 0) {
    waBtn.setAttribute('aria-disabled', 'true');
    waBtn.href = '#';
    return;
  }

  const mobileInput = document.getElementById('pos-customer-mobile');
  const phone = mobileInput ? mobileInput.value.trim() : '';

  let subtotal = State.cart.reduce((sum, item) => sum + item.line_total, 0);
  subtotal = Math.round(subtotal * 100) / 100;
  const discount = Math.min(subtotal, Math.max(0, State.discount || 0));
  const finalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  const draftBill = {
    bill_number: 'Draft',
    bill_date: State.selectedDate || getTodayDateStr(),
    bill_time: new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }),
    customer_mobile: phone,
    items: State.cart,
    subtotal: subtotal,
    discount: discount,
    final_amount: finalAmount,
    payment_mode: State.paymentMode || 'Cash',
    cafe_name: State.currentUser?.cafe_name,
    owner_whatsapp: State.currentUser?.owner_whatsapp || State.currentUser?.phone,
    receipt_footer: State.currentUser?.receipt_footer
  };

  waBtn.removeAttribute('aria-disabled');
  waBtn.href = buildWaUrl(phone, draftBill);
}
window.refreshWaLink = refreshWaLink;

function copyReceiptText() {
  const bill = State.activeReceiptBill;
  if (!bill) return;
  const txt = formatBillForWhatsApp(bill).replace(/\*/g, '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => {
      showToast('Bill text copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Clipboard access denied', 'info');
    });
  } else {
    showToast('Clipboard not supported in this browser', 'info');
  }
}
window.copyReceiptText = copyReceiptText;

function printReceipt() {
  window.print();
}

function downloadReceiptAsText() {
  const bill = State.activeReceiptBill;
  if (!bill) return;

  const cafeName = (bill.cafe_name || State.currentUser?.cafe_name || 'Cafe Delight').toUpperCase();
  const address = bill.cafe_address || State.currentUser?.address || 'Main Street, Food Plaza';
  const phone = bill.cafe_phone || State.currentUser?.phone || '+91 98765 43210';
  const footer = bill.receipt_footer || State.currentUser?.receipt_footer || 'Thank you for visiting!';

  let text = `========================================\n`;
  text += `           ${cafeName}\n`;
  text += `      ${address}\n`;
  text += `         Ph: ${phone}\n`;
  text += `========================================\n`;
  text += `Bill No: ${bill.bill_number.padEnd(16)} Time: ${bill.bill_time}\n`;
  text += `Date:    ${bill.bill_date.padEnd(16)} Mode: ${bill.payment_mode}\n`;
  if (bill.customer_mobile) {
    text += `Customer Mobile: ${bill.customer_mobile}\n`;
  }
  text += `----------------------------------------\n`;
  text += `Item                 Qty   Price   Total\n`;
  text += `----------------------------------------\n`;

  if (bill.items) {
    for (const item of bill.items) {
      const name = item.item_name.substring(0, 18).padEnd(19);
      const qty = String(item.quantity).padStart(3);
      const price = String(item.price).padStart(7);
      const total = String(item.line_total).padStart(8);
      text += `${name} ${qty} ${price} ${total}\n`;
    }
  }

  text += `----------------------------------------\n`;
  text += `Subtotal:                        ₹${bill.subtotal.toFixed(2)}\n`;
  if (bill.discount > 0) {
    text += `Discount:                       -₹${bill.discount.toFixed(2)}\n`;
  }
  text += `========================================\n`;
  text += `FINAL PAYABLE:                   ₹${bill.final_amount.toFixed(2)}\n`;
  text += `========================================\n`;
  text += `      ${footer}\n`;
  text += `========================================\n`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `${bill.bill_number}.txt`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}
