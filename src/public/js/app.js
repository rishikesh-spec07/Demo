// Application Entry Point, Navigation & Authentication Lifecycle

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  State.selectedDate = getTodayDateStr();
  setupGlobalDateSelector();
  setupNavigation();
  setupMobileNavigation();
  setupAuthEventListeners();
  setupReceiptModalActions();
  setupGlobalShortcuts();

  await checkSession();
}

// -------------------------------------------------------------
// Authentication & Session Management (Section 2)
// -------------------------------------------------------------
async function checkSession() {
  try {
    const res = await API.getMe();
    if (res && res.user) {
      State.currentUser = res.user;
      showAppContainer();
      await bootstrapAppData();
      navigateTo('dashboard');
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('view-login').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function showAppContainer() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  updateUserInterfaceProfile();
}

function updateUserInterfaceProfile() {
  if (!State.currentUser) return;
  const user = State.currentUser;

  const sidebarName = document.getElementById('sidebar-cafe-name');
  const userDisplay = document.getElementById('user-display-name');
  const userAvatar = document.getElementById('user-avatar-initials');

  if (sidebarName) sidebarName.textContent = user.cafe_name || 'Cafe Delight';
  if (userDisplay) userDisplay.textContent = user.username || 'Owner';
  if (userAvatar) {
    const initial = (user.username || 'O').substring(0, 2).toUpperCase();
    userAvatar.textContent = initial;
  }
}

function setupAuthEventListeners() {
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username');
      const passwordInput = document.getElementById('login-password');
      const rememberInput = document.getElementById('login-remember');
      const btnSubmit = document.getElementById('btn-login-submit');

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const remember = rememberInput ? rememberInput.checked : true;

      if (!username || !password) {
        showToast('Please enter both username and password', 'warning');
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Signing In...';

      try {
        const res = await API.login(username, password, remember);
        if (res && res.user) {
          State.currentUser = res.user;
          showToast(`Welcome back, ${res.user.username}!`, 'success');
          showAppContainer();
          await bootstrapAppData();
          navigateTo('dashboard');
        }
      } catch (err) {
        showToast(err.message || 'Login failed', 'error');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Sign In to Cafe Dashboard';
      }
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Are you sure you want to log out of Cafe Management?')) {
        await API.logout();
        State.currentUser = null;
        showToast('Logged out successfully', 'info');
        showLoginView();
      }
    });
  }
}

function quickFillLogin(username, password) {
  const u = document.getElementById('login-username');
  const p = document.getElementById('login-password');
  if (u) u.value = username;
  if (p) p.value = password;
  const btn = document.getElementById('btn-login-submit');
  if (btn) btn.focus();
}
window.quickFillLogin = quickFillLogin;

// -------------------------------------------------------------
// App Data Bootstrapping
// -------------------------------------------------------------
async function bootstrapAppData() {
  try {
    const [catsRes, itemsRes] = await Promise.all([
      API.getCategories(),
      API.getMenu()
    ]);

    if (catsRes && catsRes.categories) {
      State.categories = catsRes.categories;
    }
    if (itemsRes && itemsRes.items) {
      State.menuItems = itemsRes.items;
    }

    initPOS();
    initCustomersView();
    initHistory();
    initMenuManagement();
    initProfitView();
  } catch (err) {
    console.error('Failed to bootstrap app data:', err);
  }
}

// -------------------------------------------------------------
// Global Date Selection (Section 3)
// -------------------------------------------------------------
function setupGlobalDateSelector() {
  const picker = document.getElementById('global-date-picker');
  const btnToday = document.getElementById('btn-quick-today');
  const btnYesterday = document.getElementById('btn-quick-yesterday');

  if (picker) {
    picker.value = State.selectedDate;
    picker.addEventListener('change', () => {
      setSelectedDate(picker.value);
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      setSelectedDate(getTodayDateStr());
    });
  }

  if (btnYesterday) {
    btnYesterday.addEventListener('click', () => {
      setSelectedDate(getYesterdayDateStr());
    });
  }
}

function setSelectedDate(dateStr) {
  if (!dateStr) return;
  State.selectedDate = dateStr;

  const picker = document.getElementById('global-date-picker');
  const btnToday = document.getElementById('btn-quick-today');
  const btnYesterday = document.getElementById('btn-quick-yesterday');

  if (picker) picker.value = dateStr;

  const today = getTodayDateStr();
  const yesterday = getYesterdayDateStr();

  if (btnToday) {
    btnToday.classList.toggle('active', dateStr === today);
  }
  if (btnYesterday) {
    btnYesterday.classList.toggle('active', dateStr === yesterday);
  }

  refreshCurrentView();
}

function refreshCurrentView() {
  loadDashboardData();

  if (State.activeView === 'sales') {
    loadDailySalesView();
  } else if (State.activeView === 'profit') {
    loadProfitData();
  } else if (State.activeView === 'history') {
    loadHistoryData();
  }
}

// -------------------------------------------------------------
// Mobile Drawer & Bottom Navigation Bar
// -------------------------------------------------------------
function toggleMobileSidebar(open) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open', Boolean(open));
  }
  if (backdrop) {
    backdrop.classList.toggle('active', Boolean(open));
  }
}
window.toggleMobileSidebar = toggleMobileSidebar;

function setupMobileNavigation() {
  // Mobile bottom nav buttons
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) {
        navigateTo(view);
      }
    });
  });
}

// -------------------------------------------------------------
// Navigation Controller
// -------------------------------------------------------------
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (view) {
        navigateTo(view);
        toggleMobileSidebar(false); // close drawer on mobile tap
      }
    });
  });

  const btnHeaderNewBill = document.getElementById('btn-header-new-bill');
  if (btnHeaderNewBill) {
    btnHeaderNewBill.addEventListener('click', () => {
      navigateTo('pos');
    });
  }
}

function navigateTo(viewName) {
  State.activeView = viewName;

  // Update desktop sidebar items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update mobile bottom nav items
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update view visibility
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Update header title
  const titleEl = document.getElementById('current-view-title');
  const titles = {
    dashboard: 'Dashboard',
    pos: 'Create Bill',
    customers: "Owner's Customer List",
    history: 'Bill History',
    menu: 'Food Menu',
    sales: 'Daily Sales',
    profit: 'Profit & Expenses',
    settings: 'Settings'
  };
  if (titleEl) titleEl.textContent = titles[viewName] || 'Cafe POS';

  // Trigger view data refreshes
  switch (viewName) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'pos':
      if (window.setPosMobileView) window.setPosMobileView('menu');
      break;
    case 'customers':
      if (window.loadCustomersData) window.loadCustomersData();
      break;
    case 'history':
      loadHistoryData();
      break;
    case 'menu':
      renderMenuItemsTable();
      break;
    case 'sales':
      loadDailySalesView();
      break;
    case 'profit':
      loadProfitData();
      break;
    case 'settings':
      loadSettingsData();
      break;
  }
}
window.navigateTo = navigateTo;

// -------------------------------------------------------------
// Receipt Modal Button Actions
// -------------------------------------------------------------
function setupReceiptModalActions() {
  const btnPrint = document.getElementById('btn-print-receipt');
  if (btnPrint) {
    btnPrint.addEventListener('click', printReceipt);
  }

  const btnDownload = document.getElementById('btn-download-receipt');
  if (btnDownload) {
    btnDownload.addEventListener('click', downloadReceiptAsText);
  }

  const btnNext = document.getElementById('btn-new-bill-from-receipt');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      closeModal('modal-receipt');
      navigateTo('pos');
      if (window.setPosMobileView) window.setPosMobileView('menu');
    });
  }
}

// -------------------------------------------------------------
// Global Keyboard Shortcuts
// -------------------------------------------------------------
function setupGlobalShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      toggleMobileSidebar(false);
    }

    if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b')) {
      e.preventDefault();
      navigateTo('pos');
    }
  });
}
