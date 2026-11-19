// Profit & Expenses Tracking (Section 10)

function initProfitView() {
  setupProfitEventListeners();
  loadProfitData();
}

function setupProfitEventListeners() {
  const formExpense = document.getElementById('form-add-expense');
  if (formExpense) {
    formExpense.addEventListener('submit', (e) => {
      e.preventDefault();
      saveExpense();
    });
  }
}

async function loadProfitData() {
  const targetDate = State.selectedDate || getTodayDateStr();

  const totalSalesEl = document.getElementById('profit-total-sales');
  const totalExpEl = document.getElementById('profit-total-expenses');
  const netProfitEl = document.getElementById('profit-net-value');
  const netCard = document.getElementById('profit-net-card');
  const marginSub = document.getElementById('profit-margin-sub');
  const expenseCountSub = document.getElementById('profit-expense-count-sub');
  const alertBox = document.getElementById('profit-alert-box');
  const alertText = document.getElementById('profit-alert-text');
  const tbody = document.getElementById('profit-expenses-tbody');
  const expenseBadge = document.getElementById('profit-expense-badge');

  try {
    const res = await API.getProfitReport(targetDate);
    if (!res || !res.report) return;

    const report = res.report;

    if (totalSalesEl) totalSalesEl.textContent = formatCurrency(report.total_sales);
    if (totalExpEl) totalExpEl.textContent = formatCurrency(report.total_expenses);
    if (expenseCountSub) expenseCountSub.textContent = `${report.expenses?.length || 0} expenses recorded`;
    if (expenseBadge) expenseBadge.textContent = `${report.expenses?.length || 0} items`;

    // CRITICAL: Section 10 Requirement:
    // "If expenses have not been entered, display profit as unavailable rather than assuming it equals revenue."
    if (!report.has_expenses) {
      if (netProfitEl) {
        netProfitEl.textContent = 'Unavailable';
        netProfitEl.style.color = '#d97706'; // Amber color
      }
      if (marginSub) marginSub.textContent = 'Expenses not recorded';
      if (netCard) {
        netCard.className = 'stat-card';
        netCard.style.borderTop = '3px solid #f59e0b';
      }

      if (alertBox && alertText) {
        alertBox.style.display = 'flex';
        alertBox.className = 'profit-notice-box warning';
        alertText.innerHTML = `
          <strong>Expenses not entered for ${formatDateDisplay(report.date)}.</strong>
          Net profit is marked as <em>Unavailable</em> rather than assuming 100% margin. Please enter your daily expenses below to calculate true net profit.
        `;
      }
    } else {
      // Expenses HAVE been entered
      if (netProfitEl) {
        netProfitEl.textContent = formatCurrency(report.net_profit);
        netProfitEl.style.color = report.net_profit >= 0 ? '#059669' : '#dc2626';
      }
      if (marginSub) {
        marginSub.textContent = `Net Margin: ${report.profit_margin}%`;
      }
      if (netCard) {
        netCard.className = `stat-card ${report.net_profit >= 0 ? 'success' : 'danger'}`;
      }

      if (alertBox && alertText) {
        alertBox.style.display = 'flex';
        alertBox.className = `profit-notice-box ${report.net_profit >= 0 ? '' : 'warning'}`;
        alertText.innerHTML = `
          <strong>Calculated Net Profit for ${formatDateDisplay(report.date)}:</strong>
          Total Sales (${formatCurrency(report.total_sales)}) − Total Expenses (${formatCurrency(report.total_expenses)}) = <strong>${formatCurrency(report.net_profit)}</strong>.
        `;
      }
    }

    // Render recorded expenses table
    if (tbody) {
      if (!report.expenses || report.expenses.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px;">
              No expenses recorded yet for ${formatDateDisplay(report.date)}. Add ingredients, staff, electricity or rent using the form.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = report.expenses.map(e => `
        <tr>
          <td>
            <strong>${escapeHtml(e.category)}</strong>
          </td>
          <td style="color: var(--text-muted);">
            ${e.description ? escapeHtml(e.description) : '<span style="color: var(--text-light);">—</span>'}
          </td>
          <td style="text-align: right; font-weight: 700; color: #dc2626; font-size: 14px;">
            ${formatCurrency(e.amount)}
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn-remove-row" onclick="deleteExpenseEntry(${e.id})" title="Delete Expense">
              ✕
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message || 'Failed to load profit data', 'error');
  }
}

async function saveExpense() {
  const catSelect = document.getElementById('expense-category');
  const amountInput = document.getElementById('expense-amount');
  const descInput = document.getElementById('expense-desc');

  const category = catSelect ? catSelect.value : '';
  const amount = parseFloat(amountInput ? amountInput.value : 0);
  const description = descInput ? descInput.value.trim() : '';

  if (!category) {
    showToast('Please select an expense category', 'warning');
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid expense amount', 'warning');
    return;
  }

  try {
    await API.addExpense({
      expense_date: State.selectedDate || getTodayDateStr(),
      category,
      amount,
      description
    });

    showToast(`Recorded expense: ${formatCurrency(amount)} (${category})`, 'success');

    if (amountInput) amountInput.value = '';
    if (descInput) descInput.value = '';

    loadProfitData();
  } catch (err) {
    showToast(err.message || 'Failed to save expense', 'error');
  }
}

async function deleteExpenseEntry(id) {
  if (!confirm('Are you sure you want to remove this expense entry?')) return;

  try {
    await API.deleteExpense(id);
    showToast('Expense removed', 'info');
    loadProfitData();
  } catch (err) {
    showToast(err.message || 'Failed to delete expense', 'error');
  }
}

