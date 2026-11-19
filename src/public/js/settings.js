// Settings & Cafe Profile Management (Section 9 & 11)

function initSettingsView() {
  setupSettingsEventListeners();
  loadSettingsData();
}

function setupSettingsEventListeners() {
  const formProfile = document.getElementById('form-cafe-profile');
  if (formProfile) {
    formProfile.addEventListener('submit', (e) => {
      e.preventDefault();
      saveCafeProfile();
    });
  }

  const formPassword = document.getElementById('form-change-password');
  if (formPassword) {
    formPassword.addEventListener('submit', (e) => {
      e.preventDefault();
      updateOwnerPassword();
    });
  }

  const btnAddCategory = document.getElementById('btn-add-category');
  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', () => {
      document.getElementById('category-name-input').value = '';
      openModal('modal-category');
    });
  }

  const btnSaveCategory = document.getElementById('btn-save-category');
  if (btnSaveCategory) {
    btnSaveCategory.addEventListener('click', saveNewCategory);
  }

  // Quick Test Link for Owner WhatsApp
  const btnTestWa = document.getElementById('btn-test-owner-whatsapp');
  if (btnTestWa) {
    btnTestWa.addEventListener('click', testOwnerWhatsApp);
  }
}

function testOwnerWhatsApp() {
  const waInput = document.getElementById('settings-owner-whatsapp');
  const rawNumber = waInput ? waInput.value.trim() : (State.currentUser?.owner_whatsapp || '');
  const cleanNumber = rawNumber.replace(/[^0-9]/g, '');

  if (!cleanNumber || cleanNumber.length < 10) {
    showToast('Please enter a valid 10-digit WhatsApp number to test', 'warning');
    if (waInput) waInput.focus();
    return;
  }

  const finalPhone = cleanNumber.length === 10 ? '91' + cleanNumber : cleanNumber;
  const cafeName = State.currentUser?.cafe_name || 'Cafe Delight';
  const testMsg = `☕ *${cafeName}* - WhatsApp Sender Verification\nThis test message confirms that your WhatsApp number +${finalPhone} is active and ready to dispatch customer bill text receipts!`;

  window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(testMsg)}`, '_blank');
  showToast(`Opening WhatsApp to verify +${finalPhone}...`, 'info');
}

function loadSettingsData() {
  if (State.currentUser) {
    const user = State.currentUser;
    const nameInput = document.getElementById('settings-cafe-name');
    const ownerWaInput = document.getElementById('settings-owner-whatsapp');
    const phoneInput = document.getElementById('settings-phone');
    const addressInput = document.getElementById('settings-address');
    const gstinInput = document.getElementById('settings-gstin');
    const footerInput = document.getElementById('settings-footer');

    if (nameInput) nameInput.value = user.cafe_name || '';
    if (ownerWaInput) ownerWaInput.value = user.owner_whatsapp || user.phone || '+91 98765 43210';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (addressInput) addressInput.value = user.address || '';
    if (gstinInput) gstinInput.value = user.gstin || '';
    if (footerInput) footerInput.value = user.receipt_footer || '';
  }

  renderCategoriesList();
}

function renderCategoriesList() {
  const container = document.getElementById('settings-categories-list');
  if (!container) return;

  if (!State.categories || State.categories.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No categories configured.</div>';
    return;
  }

  container.innerHTML = State.categories.map(cat => {
    const itemCount = State.menuItems.filter(i => i.category_id === cat.id).length;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(cat.name)}</div>
        <span style="font-size: 11px; background: #e2e8f0; padding: 2px 8px; border-radius: var(--radius-full); color: #475569;">
          ${itemCount} items
        </span>
      </div>
    `;
  }).join('');
}

async function saveCafeProfile() {
  const cafe_name = document.getElementById('settings-cafe-name').value.trim();
  const owner_whatsapp = document.getElementById('settings-owner-whatsapp') ? document.getElementById('settings-owner-whatsapp').value.trim() : '';
  const phone = document.getElementById('settings-phone').value.trim();
  const address = document.getElementById('settings-address').value.trim();
  const gstin = document.getElementById('settings-gstin').value.trim();
  const receipt_footer = document.getElementById('settings-footer').value.trim();

  if (!cafe_name) {
    showToast('Cafe name is required', 'warning');
    return;
  }

  if (!owner_whatsapp) {
    showToast('Owner WhatsApp number is required for sending receipts', 'warning');
    return;
  }

  try {
    const res = await API.updateProfile({
      cafe_name,
      owner_whatsapp,
      phone: phone || owner_whatsapp,
      address,
      gstin,
      receipt_footer
    });

    if (res && res.user) {
      State.currentUser = { ...State.currentUser, ...res.user };
      updateUserInterfaceProfile();

      // Update POS sender display live
      const posSenderDisplay = document.getElementById('pos-owner-sender-display');
      if (posSenderDisplay) {
        posSenderDisplay.textContent = res.user.owner_whatsapp || res.user.phone || '+91 98765 43210';
      }

      showToast('Settings saved! WhatsApp sender number updated successfully.', 'success');
    }
  } catch (err) {
    showToast(err.message || 'Failed to update profile', 'error');
  }
}

async function updateOwnerPassword() {
  const oldPassword = document.getElementById('pwd-current').value;
  const newPassword = document.getElementById('pwd-new').value;

  if (!oldPassword || !newPassword) {
    showToast('Please provide current and new passwords', 'warning');
    return;
  }

  try {
    await API.changePassword(oldPassword, newPassword);
    showToast('Password updated successfully', 'success');
    document.getElementById('pwd-current').value = '';
    document.getElementById('pwd-new').value = '';
  } catch (err) {
    showToast(err.message || 'Failed to change password', 'error');
  }
}

async function saveNewCategory() {
  const input = document.getElementById('category-name-input');
  const name = input ? input.value.trim() : '';

  if (!name) {
    showToast('Please enter a category name', 'warning');
    return;
  }

  try {
    await API.createCategory(name);
    showToast(`Category "${name}" created`, 'success');
    closeModal('modal-category');
    
    // Reload categories
    const res = await API.getCategories();
    if (res && res.categories) {
      State.categories = res.categories;
      populateCategoryDropdowns();
      renderPOSCategories();
      renderCategoriesList();
    }
  } catch (err) {
    showToast(err.message || 'Failed to create category', 'error');
  }
}

