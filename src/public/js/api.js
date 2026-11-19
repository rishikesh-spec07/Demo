// Centralized API Client for Cafe Management System

const API = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = localStorage.getItem('cafe_session_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        // If not on login, switch to login view
        if (!url.includes('/api/auth/login')) {
          localStorage.removeItem('cafe_session_token');
          if (window.showLoginView) {
            window.showLoginView();
          }
        }
        throw new Error(data.error || 'Authentication required');
      }

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error on [${options.method || 'GET'} ${url}]:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password, rememberMe = true) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe })
    });
    if (res.token) {
      localStorage.setItem('cafe_session_token', res.token);
    }
    return res;
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('cafe_session_token');
    }
  },

  async updateProfile(profileData) {
    return this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  async changePassword(oldPassword, newPassword) {
    return this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  // Menu Endpoints
  async getMenu(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/menu${query ? '?' + query : ''}`);
  },

  async getMenuItemByCode(code) {
    return this.request(`/api/menu/code/${encodeURIComponent(code)}`);
  },

  async createMenuItem(itemData) {
    return this.request('/api/menu', {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  },

  async updateMenuItem(id, itemData) {
    return this.request(`/api/menu/${id}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
  },

  async toggleMenuItem(id) {
    return this.request(`/api/menu/${id}/toggle`, {
      method: 'POST'
    });
  },

  async deleteMenuItem(id) {
    return this.request(`/api/menu/${id}`, {
      method: 'DELETE'
    });
  },

  async getCategories() {
    return this.request('/api/categories');
  },

  async createCategory(name, displayOrder = 0) {
    return this.request('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, display_order: displayOrder })
    });
  },

  // Billing Endpoints
  async createBill(billData) {
    return this.request('/api/bills', {
      method: 'POST',
      body: JSON.stringify(billData)
    });
  },

  async getBills(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/bills${query ? '?' + query : ''}`);
  },

  async getBillById(id) {
    return this.request(`/api/bills/${id}`);
  },

  async cancelBill(id, reason) {
    return this.request(`/api/bills/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Customers Endpoints (Owner's Customer List)
  async getCustomers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/customers${query ? '?' + query : ''}`);
  },

  async lookupCustomer(phone) {
    return this.request(`/api/customers/lookup/${encodeURIComponent(phone)}`);
  },

  async getCustomerBills(phone) {
    return this.request(`/api/customers/${encodeURIComponent(phone)}/bills`);
  },

  // Sales Endpoints
  async getDailySales(date) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/api/sales/daily${query}`);
  },

  async getSalesTrends(days = 7) {
    return this.request(`/api/sales/trends?days=${days}`);
  },

  // Profit & Expenses Endpoints
  async getProfitReport(date) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`/api/profit${query}`);
  },

  async addExpense(expenseData) {
    return this.request('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    });
  },

  async deleteExpense(id) {
    return this.request(`/api/expenses/${id}`, {
      method: 'DELETE'
    });
  }
};

