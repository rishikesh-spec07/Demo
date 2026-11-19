// Food Menu & Item Management (Section 9)

function initMenuManagement() {
  setupMenuEventListeners();
  loadMenuData();
}

function setupMenuEventListeners() {
  const searchInput = document.getElementById('menu-search-input');
  const catFilter = document.getElementById('menu-cat-filter');
  const btnAddItem = document.getElementById('btn-add-food-item');
  const btnSaveItem = document.getElementById('btn-save-food-item');

  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderMenuItemsTable, 250);
    });
  }

  if (catFilter) {
    catFilter.addEventListener('change', renderMenuItemsTable);
  }

  if (btnAddItem) {
    btnAddItem.addEventListener('click', openAddFoodItemModal);
  }

  if (btnSaveItem) {
    btnSaveItem.addEventListener('click', saveFoodItem);
  }
}

async function loadMenuData() {
  try {
    const [catsRes, itemsRes] = await Promise.all([
      API.getCategories(),
      API.getMenu()
    ]);

    if (catsRes && catsRes.categories) {
      State.categories = catsRes.categories;
      populateCategoryDropdowns();
    }

    if (itemsRes && itemsRes.items) {
      State.menuItems = itemsRes.items;
      renderMenuItemsTable();
    }
  } catch (err) {
    showToast(err.message || 'Failed to load menu data', 'error');
  }
}

function populateCategoryDropdowns() {
  // Category filter dropdown in Menu Management
  const catFilter = document.getElementById('menu-cat-filter');
  if (catFilter) {
    catFilter.innerHTML = '<option value="all">All Categories</option>' +
      State.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  // Category select in Add/Edit Food Item modal
  const modalCatSelect = document.getElementById('food-item-category');
  if (modalCatSelect) {
    modalCatSelect.innerHTML = '<option value="">-- No Category --</option>' +
      State.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
}

function renderMenuItemsTable() {
  const tbody = document.getElementById('menu-items-tbody');
  const searchInput = document.getElementById('menu-search-input');
  const catFilter = document.getElementById('menu-cat-filter');

  if (!tbody) return;

  let items = State.menuItems.slice();

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (query) {
    items = items.filter(i =>
      i.name.toLowerCase().includes(query) ||
      String(i.code).toLowerCase().includes(query) ||
      (i.category_name && i.category_name.toLowerCase().includes(query))
    );
  }

  const selectedCat = catFilter ? catFilter.value : 'all';
  if (selectedCat !== 'all') {
    items = items.filter(i => String(i.category_id) === String(selectedCat));
  }

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No food items found matching your filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr style="${!item.is_active ? 'opacity: 0.6; background-color: #f8fafc;' : ''}">
      <td>
        <span class="item-code-badge" style="font-size: 13px;">#${escapeHtml(item.code)}</span>
      </td>
      <td>
        <strong style="color: var(--text-main); font-size: 14px;">${escapeHtml(item.name)}</strong>
        ${item.description ? `<div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.description)}</div>` : ''}
      </td>
      <td>
        <span style="background: #f1f5f9; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 12px;">
          ${escapeHtml(item.category_name || 'General')}
        </span>
      </td>
      <td style="font-weight: 700; color: var(--primary-dark); font-size: 14px;">
        ${formatCurrency(item.price)}
      </td>
      <td>
        <span class="status-pill ${item.is_active ? 'active' : 'inactive'}" style="cursor: pointer;" onclick="toggleItemStatus(${item.id})" title="Click to toggle availability">
          ${item.is_active ? '● Available' : '○ Inactive'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openEditFoodItemModal(${item.id})">
            Edit
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="deleteFoodItem(${item.id}, '${escapeHtml(item.name)}')">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddFoodItemModal() {
  document.getElementById('food-modal-title').textContent = 'Add New Food Item';
  document.getElementById('food-item-id').value = '';
  document.getElementById('food-item-code').value = '';
  document.getElementById('food-item-code').disabled = false;
  document.getElementById('food-item-name').value = '';
  document.getElementById('food-item-price').value = '';
  document.getElementById('food-item-category').value = '';
  document.getElementById('food-item-desc').value = '';
  document.getElementById('food-item-active').checked = true;

  openModal('modal-food-item');
  document.getElementById('food-item-code').focus();
}

function openEditFoodItemModal(itemId) {
  const item = State.menuItems.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('food-modal-title').textContent = `Edit Food Item: ${item.name}`;
  document.getElementById('food-item-id').value = item.id;
  document.getElementById('food-item-code').value = item.code;
  document.getElementById('food-item-code').disabled = false;
  document.getElementById('food-item-name').value = item.name;
  document.getElementById('food-item-price').value = item.price;
  document.getElementById('food-item-category').value = item.category_id || '';
  document.getElementById('food-item-desc').value = item.description || '';
  document.getElementById('food-item-active').checked = Boolean(item.is_active);

  openModal('modal-food-item');
  document.getElementById('food-item-price').focus();
}

async function saveFoodItem() {
  const id = document.getElementById('food-item-id').value;
  const code = document.getElementById('food-item-code').value.trim();
  const name = document.getElementById('food-item-name').value.trim();
  const price = parseFloat(document.getElementById('food-item-price').value);
  const category_id = document.getElementById('food-item-category').value ? parseInt(document.getElementById('food-item-category').value, 10) : null;
  const description = document.getElementById('food-item-desc').value.trim();
  const is_active = document.getElementById('food-item-active').checked ? 1 : 0;

  if (!code) {
    showToast('Food code is required', 'warning');
    return;
  }
  if (!name) {
    showToast('Food name is required', 'warning');
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast('Valid food price is required', 'warning');
    return;
  }

  const payload = {
    code,
    name,
    price,
    category_id,
    description,
    is_active
  };

  try {
    if (id) {
      await API.updateMenuItem(id, payload);
      showToast(`Updated "${name}". New bills will use price ${formatCurrency(price)}.`, 'success');
    } else {
      await API.createMenuItem(payload);
      showToast(`Created new food item "${name}" with code #${code}`, 'success');
    }

    closeModal('modal-food-item');
    await loadMenuData();

    // Re-render POS view
    renderPOSCategories();
    renderPOSMenuItems();
  } catch (err) {
    showToast(err.message || 'Failed to save food item', 'error');
  }
}

async function toggleItemStatus(itemId) {
  try {
    const res = await API.toggleMenuItem(itemId);
    if (res && res.item) {
      const idx = State.menuItems.findIndex(i => i.id === itemId);
      if (idx > -1) State.menuItems[idx] = res.item;
      renderMenuItemsTable();
      renderPOSMenuItems();
      showToast(`${res.item.name} is now ${res.item.is_active ? 'Available' : 'Inactive'}`, 'info');
    }
  } catch (err) {
    showToast(err.message || 'Failed to toggle status', 'error');
  }
}

async function deleteFoodItem(itemId, itemName) {
  if (!confirm(`Are you sure you want to delete or deactivate "${itemName}"?`)) {
    return;
  }

  try {
    const res = await API.deleteMenuItem(itemId);
    showToast(res.message || 'Item processed', 'info');
    await loadMenuData();
    renderPOSCategories();
    renderPOSMenuItems();
  } catch (err) {
    showToast(err.message || 'Failed to delete item', 'error');
  }
}

