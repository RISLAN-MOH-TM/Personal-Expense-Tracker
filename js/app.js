/* =============================================================
   app.js — Personal Expense Tracker Logic
   Supports:
   - Dynamic LocalStorage data persistence (user-scoped)
   - Currency display in LKR (Sri Lankan Rupee)
   - Interactive type selector (Income / Expense toggle)
   - Add & EDIT transaction form handling with validation
   - Live transaction search, date range, category/type filtering
   - Sorting and CSV export for transactions
   - Dynamic summary calculations for Dashboard & Transactions
   - Month selector + dynamic monthly summary
   - Dynamic category spending breakdown & progress bars
   - Transaction deletion
   ============================================================= */

const CATEGORY_MAP = {
  food: { name: 'Food', icon: '🍔', label: 'Food & Groceries' },
  transport: { name: 'Transport', icon: '🚌', label: 'Transport' },
  shopping: { name: 'Shopping', icon: '🛍️', label: 'Shopping' },
  bills: { name: 'Bills', icon: '⚡', label: 'Bills & Utilities' },
  entertainment: { name: 'Entertainment', icon: '🎬', label: 'Entertainment' },
  healthcare: { name: 'Healthcare', icon: '❤️', label: 'Healthcare' },
  education: { name: 'Education', icon: '📚', label: 'Education' },
  work: { name: 'Work', icon: '💼', label: 'Work / Salary' },
  other: { name: 'Other', icon: '📦', label: 'Other' }
};

// Order used by the Categories page & monthly breakdown
const EXPENSE_CATEGORY_KEYS = [
  'food', 'transport', 'shopping', 'bills', 'entertainment',
  'healthcare', 'education', 'work', 'other'
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// -------------------------------------------------------------
// Storage API (User-Scoped)
// -------------------------------------------------------------
function getActiveUserId() {
  if (typeof getCurrentUser === 'function') {
    const user = getCurrentUser();
    if (user && user.id) return user.id;
  }
  return null;
}

function getUserStorageKey(userId) {
  const uid = userId || getActiveUserId() || 'guest';
  return `expense_tracker_tx_${uid}`;
}

function getTransactions(targetUserId) {
  const uid = targetUserId || getActiveUserId();
  if (!uid) {
    return [];
  }

  const key = getUserStorageKey(uid);
  const data = localStorage.getItem(key);

  if (data !== null) {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Return existing user transactions (even if empty [])
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse user transactions:', e);
    }
  }

  // For any new user or other account: clean slate, strictly no sample data!
  const empty = [];
  localStorage.setItem(key, JSON.stringify(empty));
  return empty;
}

function saveTransactions(transactions, targetUserId) {
  const uid = targetUserId || getActiveUserId();
  if (!uid) return;

  const key = getUserStorageKey(uid);
  localStorage.setItem(key, JSON.stringify(transactions));
}

function updateTransaction(id, updates, targetUserId) {
  const uid = targetUserId || getActiveUserId();
  if (!uid) return false;

  const all = getTransactions(uid);
  const index = all.findIndex(tx => String(tx.id) === String(id));
  if (index === -1) return false;

  all[index] = Object.assign({}, all[index], updates, {
    id: all[index].id,
    userId: all[index].userId || uid
  });
  saveTransactions(all, uid);
  return true;
}

function deleteTransactionById(id, targetUserId) {
  const uid = targetUserId || getActiveUserId();
  if (!uid) return false;

  const all = getTransactions(uid);
  const remaining = all.filter(tx => String(tx.id) !== String(id));
  if (remaining.length === all.length) return false;

  saveTransactions(remaining, uid);
  return true;
}

// -------------------------------------------------------------
// Formatting Helpers
// -------------------------------------------------------------
function formatNumber(num) {
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatLKR(amount, withSign = false, type = 'expense') {
  const formatted = formatNumber(Math.abs(amount));
  if (withSign) {
    return (type === 'income' ? '+LKR ' : '-LKR ') + formatted;
  }
  return (amount < 0 ? '-LKR ' : 'LKR ') + formatted;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const mIndex = parseInt(month, 10) - 1;
  const mName = MONTH_NAMES[mIndex] || month;
  return `${mName} ${String(parseInt(day, 10)).padStart(2, '0')}, ${year}`;
}

function getMonthKey(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 7);
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return '';
  const parts = String(monthKey).split('-');
  if (parts.length < 2) return monthKey;
  const year = parts[0];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const monthName = MONTH_NAMES[monthIndex] || parts[1];
  return `${monthName} ${year}`;
}

function getLocalISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateTransactionId() {
  // Date.now() alone can collide when two transactions are saved in the same millisecond
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function compareByDateDesc(a, b) {
  const dateA = a.date || '';
  const dateB = b.date || '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return Number(b.id) - Number(a.id);
}

function categoryLabel(key, type) {
  const cat = CATEGORY_MAP[key] || { name: key || 'Other', icon: '📦', label: key || 'Other' };
  if (type === 'income') {
    return `${cat.icon} ${cat.name} Income`;
  }
  return `${cat.icon} ${cat.label || cat.name}`;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// -------------------------------------------------------------
// Page 1: Add / Edit Transaction Page
// -------------------------------------------------------------
function initAddExpensePage() {
  const form = document.getElementById('transaction-form');
  const incomeBtn = document.getElementById('type-income-btn');
  const expenseBtn = document.getElementById('type-expense-btn');
  const typeInput = document.getElementById('transaction-type');
  const dateInput = document.getElementById('date');
  const alertBox = document.getElementById('form-alert');
  const saveBtn = document.getElementById('btn-save');

  if (!form || !incomeBtn || !expenseBtn || !typeInput) return;

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');
  let editingTransaction = null;

  // Track active type ('expense' by default)
  let currentType = typeInput.value || 'expense';

  function setType(type) {
    currentType = type;
    typeInput.value = type;

    if (type === 'income') {
      incomeBtn.classList.add('active', 'type-income');
      incomeBtn.setAttribute('aria-pressed', 'true');
      expenseBtn.classList.remove('active', 'type-expense');
      expenseBtn.setAttribute('aria-pressed', 'false');
    } else {
      expenseBtn.classList.add('active', 'type-expense');
      expenseBtn.setAttribute('aria-pressed', 'true');
      incomeBtn.classList.remove('active', 'type-income');
      incomeBtn.setAttribute('aria-pressed', 'false');
    }
  }

  // Bind clicks for the type toggle buttons
  incomeBtn.addEventListener('click', () => setType('income'));
  expenseBtn.addEventListener('click', () => setType('expense'));

  function showAlert(msg, isSuccess = true) {
    if (!alertBox) return;
    alertBox.className = `form-alert ${isSuccess ? 'form-alert-success' : 'form-alert-error'}`;
    alertBox.innerHTML = msg;
    alertBox.style.display = 'block';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Pre-fill today's date if empty
  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalISODate();
  }

  // -----------------------------------------------------------
  // Edit mode: pre-fill the form from ?id=<transaction id>
  // -----------------------------------------------------------
  if (editId) {
    const all = getTransactions();
    editingTransaction = all.find(tx => String(tx.id) === String(editId)) || null;

    if (!editingTransaction) {
      showAlert(
        '⚠️ Transaction not found. It may have been deleted. ' +
        '<a href="transactions.html" class="alert-action-link">Back to Transactions →</a>',
        false
      );
      if (saveBtn) saveBtn.disabled = true;
      form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => {
        if (el !== saveBtn) el.disabled = true;
      });
      return;
    }

    const pageTitle = document.querySelector('.page-title');
    const pageSubtitle = document.querySelector('.page-subtitle');
    const cancelLink = document.querySelector('.cancel-link');

    if (pageTitle) pageTitle.textContent = 'Edit Transaction';
    if (pageSubtitle) pageSubtitle.textContent = 'Update the details of this transaction.';
    if (saveBtn) saveBtn.textContent = 'Update Transaction';
    if (cancelLink) cancelLink.textContent = 'Cancel — back to Transactions';
    document.title = 'Edit Transaction — ExpenseTracker';

    setType(editingTransaction.type === 'income' ? 'income' : 'expense');

    const descInput = document.getElementById('description');
    const amountInput = document.getElementById('amount');
    const categorySelect = document.getElementById('category');
    const notesInput = document.getElementById('notes');

    if (descInput) descInput.value = editingTransaction.description || '';
    if (amountInput) amountInput.value = Number(editingTransaction.amount).toFixed(2);
    if (categorySelect) {
      const catKey = editingTransaction.categoryKey ||
        (editingTransaction.category || '').toLowerCase();
      categorySelect.value = CATEGORY_MAP[catKey] ? catKey : 'other';
    }
    if (dateInput) dateInput.value = editingTransaction.date || getLocalISODate();
    if (notesInput) notesInput.value = editingTransaction.notes || '';
  }

  // Form submission handler
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (saveBtn && saveBtn.disabled) return;

    const descInput = document.getElementById('description');
    const amountInput = document.getElementById('amount');
    const categorySelect = document.getElementById('category');
    const notesInput = document.getElementById('notes');

    const description = descInput ? descInput.value.trim() : '';
    const amount = amountInput ? parseFloat(amountInput.value) : NaN;
    const categoryKey = categorySelect ? categorySelect.value : '';
    const date = dateInput ? dateInput.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    // Validation
    if (!description) {
      showAlert('⚠️ Please enter a description.', false);
      descInput?.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      showAlert('⚠️ Please enter a valid amount in LKR greater than 0.', false);
      amountInput?.focus();
      return;
    }

    if (!categoryKey) {
      showAlert('⚠️ Please select a category.', false);
      categorySelect?.focus();
      return;
    }

    if (!date) {
      showAlert('⚠️ Please select a transaction date.', false);
      dateInput?.focus();
      return;
    }

    const uid = getActiveUserId() || 'guest';
    const catInfo = CATEGORY_MAP[categoryKey] || {
      name: categoryKey,
      icon: currentType === 'income' ? '💰' : '📦'
    };

    const payload = {
      description,
      category: catInfo.name,
      categoryKey,
      date,
      type: currentType,
      amount,
      icon: catInfo.icon,
      notes
    };

    // ---------------------------------------------------------
    // Editing an existing transaction
    // ---------------------------------------------------------
    if (editingTransaction) {
      const updated = updateTransaction(editingTransaction.id, payload, uid);

      if (!updated) {
        showAlert('❌ Could not update the transaction. It may have been deleted. ' +
          '<a href="transactions.html" class="alert-action-link">Back to Transactions →</a>', false);
        return;
      }

      showAlert(
        `✓ Transaction updated successfully! <strong>${currentType === 'income' ? '+LKR' : '-LKR'} ${formatNumber(amount)}</strong> saved. ` +
        `<a href="transactions.html" class="alert-action-link">Back to Transactions →</a>`,
        true
      );
      return;
    }

    // ---------------------------------------------------------
    // Adding a new transaction
    // ---------------------------------------------------------
    const newTx = Object.assign({ id: generateTransactionId(), userId: uid }, payload);

    const all = getTransactions(uid);
    all.unshift(newTx);
    saveTransactions(all, uid);

    showAlert(
      `✓ Transaction saved successfully! <strong>${currentType === 'income' ? '+LKR' : '-LKR'} ${formatNumber(amount)}</strong> recorded. ` +
      `<a href="transactions.html" class="alert-action-link">View in Transactions →</a>`,
      true
    );

    // Reset inputs but preserve type & today's date
    form.reset();
    setType(currentType);
    if (dateInput) dateInput.value = getLocalISODate();
    descInput?.focus();
  });
}

// -------------------------------------------------------------
// Page 2: Transactions Page
// -------------------------------------------------------------
function initTransactionsPage() {
  const tbody = document.getElementById('transactions-tbody');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('filter-category');
  const typeFilter = document.getElementById('filter-type');
  const fromInput = document.getElementById('filter-from');
  const toInput = document.getElementById('filter-to');
  const sortSelect = document.getElementById('sort-by');
  const filterBtn = document.getElementById('filter-btn');
  const resetBtn = document.getElementById('reset-filter-btn');
  const exportBtn = document.getElementById('export-csv-btn');
  const countEl = document.getElementById('transaction-count');

  const statIncome = document.getElementById('stat-income');
  const statExpense = document.getElementById('stat-expense');
  const statBalance = document.getElementById('stat-balance');

  if (!tbody) return;

  let currentFiltered = [];

  function renderRows(items) {
    tbody.innerHTML = '';

    if (items.length === 0) {
      const allUserTx = getTransactions();
      const hasAny = allUserTx.length > 0;
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      tr.innerHTML = `
        <td colspan="6" class="td-empty">
          <div class="empty-state">
            <span class="empty-icon">${hasAny ? '🔍' : '📝'}</span>
            <p class="empty-title">${hasAny ? 'No transactions found' : 'No transactions recorded yet'}</p>
            <p class="empty-subtitle">${hasAny ? 'Try adjusting your search terms, dates or filter selections.' : 'Start tracking by adding your first expense or income.'}</p>
            ${hasAny
              ? '<button type="button" class="btn btn-outline empty-reset-btn" id="empty-clear-btn">Clear all filters</button>'
              : '<a href="add-expense.html" class="btn btn-primary" style="margin-top:10px; text-decoration:none;">+ Add Transaction</a>'
            }
          </div>
        </td>
      `;
      tbody.appendChild(tr);

      const clearBtn = document.getElementById('empty-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', resetFilters);
      }
      return;
    }

    items.forEach(tx => {
      const tr = document.createElement('tr');
      const isIncome = tx.type === 'income';
      const notesHtml = tx.notes
        ? `<span class="desc-notes" title="${escapeHtml(tx.notes)}">${escapeHtml(tx.notes)}</span>`
        : '';

      tr.innerHTML = `
        <td class="td-desc">
          <span class="row-icon">${tx.icon || (isIncome ? '💰' : '📦')}</span>
          <span class="desc-block">
            <span class="desc-text">${escapeHtml(tx.description)}</span>
            ${notesHtml}
          </span>
        </td>
        <td>${escapeHtml(tx.category)}</td>
        <td>${formatDate(tx.date)}</td>
        <td>
          <span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">
            ${isIncome ? 'Income' : 'Expense'}
          </span>
        </td>
        <td class="col-amount ${isIncome ? 'amount-income' : 'amount-expense'}">
          ${formatLKR(tx.amount, true, tx.type)}
        </td>
        <td class="col-action">
          <div class="action-buttons">
            <button type="button" class="btn-edit" data-id="${tx.id}" title="Edit transaction" aria-label="Edit ${escapeHtml(tx.description)}">
              ✏️
            </button>
            <button type="button" class="btn-delete" data-id="${tx.id}" title="Delete transaction" aria-label="Delete ${escapeHtml(tx.description)}">
              🗑️
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach edit / delete listeners
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        window.location.href = `add-expense.html?id=${encodeURIComponent(id)}`;
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        deleteTransaction(id);
      });
    });
  }

  function updateSummary(items) {
    let incomeSum = 0;
    let expenseSum = 0;

    items.forEach(tx => {
      if (tx.type === 'income') {
        incomeSum += Number(tx.amount) || 0;
      } else {
        expenseSum += Number(tx.amount) || 0;
      }
    });

    const net = incomeSum - expenseSum;

    if (statIncome) statIncome.textContent = `+LKR ${formatNumber(incomeSum)}`;
    if (statExpense) statExpense.textContent = `-LKR ${formatNumber(expenseSum)}`;
    if (statBalance) {
      statBalance.textContent = (net < 0 ? '-LKR ' : 'LKR ') + formatNumber(Math.abs(net));
      statBalance.className = `summary-stat-value ${net >= 0 ? 'amount-income' : 'amount-expense'}`;
    }
  }

  function updateCount(shown, total) {
    if (!countEl) return;
    countEl.textContent = total === 0
      ? 'No transactions'
      : `Showing ${shown} of ${total} transaction${total === 1 ? '' : 's'}`;
  }

  function applyFilters() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const catVal = categoryFilter ? categoryFilter.value.toLowerCase() : '';
    const typeVal = typeFilter ? typeFilter.value.toLowerCase() : '';
    const fromVal = fromInput ? fromInput.value : '';
    const toVal = toInput ? toInput.value : '';
    const sortVal = sortSelect ? sortSelect.value : 'date-desc';

    const all = getTransactions();

    const filtered = all.filter(tx => {
      const desc = String(tx.description || '').toLowerCase();
      const cat = String(tx.category || '').toLowerCase();
      const notes = String(tx.notes || '').toLowerCase();

      // Query match in description, category, or notes
      const matchesQuery = !query ||
        desc.includes(query) ||
        cat.includes(query) ||
        notes.includes(query);

      // Category match
      const txCatKey = String(tx.categoryKey || tx.category || '').toLowerCase();
      const matchesCategory = !catVal || txCatKey === catVal || cat === catVal;

      // Type match
      const matchesType = !typeVal || tx.type === typeVal;

      // Date range match (ISO dates compare correctly as strings)
      const txDate = tx.date || '';
      const matchesFrom = !fromVal || (txDate && txDate >= fromVal);
      const matchesTo = !toVal || (txDate && txDate <= toVal);

      return matchesQuery && matchesCategory && matchesType && matchesFrom && matchesTo;
    });

    filtered.sort((a, b) => {
      switch (sortVal) {
        case 'date-asc':
          return -compareByDateDesc(a, b);
        case 'amount-desc':
          return (Number(b.amount) || 0) - (Number(a.amount) || 0);
        case 'amount-asc':
          return (Number(a.amount) || 0) - (Number(b.amount) || 0);
        case 'date-desc':
        default:
          return compareByDateDesc(a, b);
      }
    });

    currentFiltered = filtered;
    renderRows(filtered);
    updateSummary(filtered);
    updateCount(filtered.length, all.length);
  }

  function resetFilters() {
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (typeFilter) typeFilter.value = '';
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    if (sortSelect) sortSelect.value = 'date-desc';
    applyFilters();
  }

  function deleteTransaction(id) {
    const uid = getActiveUserId();
    const all = getTransactions(uid);
    const target = all.find(t => String(t.id) === String(id));
    const desc = target ? `"${target.description}"` : 'this transaction';

    if (confirm(`Are you sure you want to delete ${desc}?`)) {
      const deleted = deleteTransactionById(id, uid);
      if (deleted) {
        applyFilters();
      }
    }
  }

  function exportCSV() {
    if (!currentFiltered.length) {
      window.alert('There are no transactions to export with the current filters.');
      return;
    }

    const header = ['Date', 'Description', 'Category', 'Type', 'Amount (LKR)', 'Notes'];
    const rows = currentFiltered.map(tx => [
      tx.date || '',
      tx.description || '',
      tx.category || '',
      tx.type || '',
      (Number(tx.amount) || 0).toFixed(2),
      tx.notes || ''
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(csvCell).join(','))
      .join('\r\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${getLocalISODate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Pre-fill filters from URL (e.g. categories.html → transactions.html?category=food)
  const params = new URLSearchParams(window.location.search);
  if (params.get('q') && searchInput) searchInput.value = params.get('q');
  if (params.get('category') && categoryFilter) categoryFilter.value = params.get('category');
  if (params.get('type') && typeFilter) typeFilter.value = params.get('type');
  if (params.get('from') && fromInput) fromInput.value = params.get('from');
  if (params.get('to') && toInput) toInput.value = params.get('to');
  if (params.get('sort') && sortSelect) sortSelect.value = params.get('sort');

  // Bind filter events
  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
  if (typeFilter) typeFilter.addEventListener('change', applyFilters);
  if (fromInput) fromInput.addEventListener('change', applyFilters);
  if (toInput) toInput.addEventListener('change', applyFilters);
  if (sortSelect) sortSelect.addEventListener('change', applyFilters);
  if (filterBtn) filterBtn.addEventListener('click', applyFilters);
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
  if (exportBtn) exportBtn.addEventListener('click', exportCSV);

  // Initial render
  applyFilters();
}

// -------------------------------------------------------------
// Page 3: Dashboard Page
// -------------------------------------------------------------
function initDashboardPage() {
  const balanceEl = document.getElementById('card-balance');
  const incomeEl = document.getElementById('card-income');
  const expenseEl = document.getElementById('card-expense');
  const monthlyList = document.getElementById('monthly-list');
  const monthlyTitle = document.getElementById('monthly-summary-title');
  const monthSelect = document.getElementById('summary-month');
  const recentList = document.getElementById('recent-transactions-list');

  if (!balanceEl && !incomeEl && !expenseEl) return;

  const transactions = getTransactions();

  let incomeTotal = 0;
  let expenseTotal = 0;

  transactions.forEach(tx => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      incomeTotal += amt;
    } else {
      expenseTotal += amt;
    }
  });

  const netBalance = incomeTotal - expenseTotal;

  // Update summary cards (all-time totals)
  if (balanceEl) {
    balanceEl.textContent = (netBalance < 0 ? '-LKR ' : 'LKR ') + formatNumber(Math.abs(netBalance));
  }
  if (incomeEl) {
    incomeEl.textContent = `+LKR ${formatNumber(incomeTotal)}`;
  }
  if (expenseEl) {
    expenseEl.textContent = `LKR ${formatNumber(expenseTotal)}`;
  }

  // -----------------------------------------------------------
  // Monthly summary (filtered by the selected month)
  // -----------------------------------------------------------
  function renderMonthlySummary(monthKey) {
    if (!monthlyList) return;

    if (monthlyTitle) {
      monthlyTitle.textContent = `Monthly Summary — ${formatMonthLabel(monthKey)}`;
    }

    const monthTx = transactions.filter(tx => getMonthKey(tx.date) === monthKey);

    if (monthTx.length === 0) {
      monthlyList.innerHTML = `
        <li class="monthly-empty">
          <span class="monthly-empty-icon">📅</span>
          <span>No transactions recorded for ${escapeHtml(formatMonthLabel(monthKey))} yet.</span>
          <a href="add-expense.html" class="monthly-empty-link">Add a transaction →</a>
        </li>
      `;
      return;
    }

    const incomeByCat = {};
    const expenseByCat = {};
    let monthIncome = 0;
    let monthExpense = 0;

    monthTx.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const key = String(tx.categoryKey || tx.category || 'other').toLowerCase();
      if (tx.type === 'income') {
        monthIncome += amt;
        incomeByCat[key] = (incomeByCat[key] || 0) + amt;
      } else {
        monthExpense += amt;
        expenseByCat[key] = (expenseByCat[key] || 0) + amt;
      }
    });

    const rows = [];

    Object.keys(incomeByCat).sort().forEach(key => {
      rows.push(`
        <li class="monthly-item">
          <span class="monthly-label">${escapeHtml(categoryLabel(key, 'income'))}</span>
          <span class="amount positive">+LKR ${formatNumber(incomeByCat[key])}</span>
        </li>
      `);
    });

    EXPENSE_CATEGORY_KEYS.forEach(key => {
      const value = expenseByCat[key] || 0;
      if (value > 0) {
        rows.push(`
          <li class="monthly-item">
            <span class="monthly-label">${escapeHtml(categoryLabel(key, 'expense'))}</span>
            <span class="amount negative">-LKR ${formatNumber(value)}</span>
          </li>
        `);
      }
    });

    const monthNet = monthIncome - monthExpense;
    const netClass = monthNet > 0 ? 'positive' : (monthNet < 0 ? 'negative' : '');
    const netText = monthNet === 0
      ? 'LKR 0.00'
      : formatLKR(monthNet, true, monthNet > 0 ? 'income' : 'expense');

    rows.push(`
      <li class="monthly-item monthly-net">
        <span class="monthly-label">Net for ${escapeHtml(formatMonthLabel(monthKey))}</span>
        <span class="amount ${netClass}">${netText}</span>
      </li>
    `);

    monthlyList.innerHTML = rows.join('');
  }

  const availableMonths = Array.from(new Set(
    transactions
      .map(tx => getMonthKey(tx.date))
      .filter(Boolean)
  )).sort().reverse();

  const currentMonth = getLocalISODate().slice(0, 7);

  if (monthSelect) {
    monthSelect.innerHTML = '';

    if (availableMonths.length === 0) {
      const opt = document.createElement('option');
      opt.value = currentMonth;
      opt.textContent = formatMonthLabel(currentMonth);
      monthSelect.appendChild(opt);
    } else {
      availableMonths.forEach(monthKey => {
        const opt = document.createElement('option');
        opt.value = monthKey;
        opt.textContent = formatMonthLabel(monthKey);
        monthSelect.appendChild(opt);
      });
    }

    monthSelect.value = availableMonths.includes(currentMonth)
      ? currentMonth
      : (availableMonths[0] || currentMonth);

    monthSelect.addEventListener('change', () => renderMonthlySummary(monthSelect.value));
  }

  renderMonthlySummary(
    monthSelect
      ? monthSelect.value
      : (availableMonths[0] || currentMonth)
  );

  // -----------------------------------------------------------
  // Recent transactions (truly newest first, latest 5)
  // -----------------------------------------------------------
  if (recentList) {
    recentList.innerHTML = '';
    const recent = transactions.slice().sort(compareByDateDesc).slice(0, 5);

    if (recent.length === 0) {
      recentList.innerHTML = '<li class="transaction-item" style="justify-content:center; color:var(--text-muted); padding:24px;">No transactions yet. Add your first transaction above!</li>';
    } else {
      recent.forEach(tx => {
        const isIncome = tx.type === 'income';
        const li = document.createElement('li');
        li.className = 'transaction-item';
        li.innerHTML = `
          <div class="transaction-avatar ${isIncome ? 'income-avatar' : 'expense-avatar'}">
            ${tx.icon || (isIncome ? '💰' : '📦')}
          </div>
          <div class="transaction-info">
            <span class="transaction-desc">${escapeHtml(tx.description)}</span>
            <span class="transaction-category">${escapeHtml(tx.category)}${tx.notes ? ' · ' + escapeHtml(tx.notes) : ''}</span>
          </div>
          <span class="transaction-date">${formatDate(tx.date)}</span>
          <span class="amount ${isIncome ? 'positive' : 'negative'}">
            ${formatLKR(tx.amount, true, tx.type)}
          </span>
        `;
        recentList.appendChild(li);
      });
    }
  }
}

// -------------------------------------------------------------
// Page 4: Categories Page
// -------------------------------------------------------------
function initCategoriesPage() {
  const totalSpentEl = document.getElementById('categories-total-spent');
  const activeCountEl = document.getElementById('categories-active-count');
  const txCountEl = document.getElementById('categories-tx-count');
  const gridEl = document.getElementById('categories-grid');
  const emptyEl = document.getElementById('categories-empty');

  if (!totalSpentEl && !gridEl) return;

  const transactions = getTransactions();

  const spending = {};
  const counts = {};
  EXPENSE_CATEGORY_KEYS.forEach(key => {
    spending[key] = 0;
    counts[key] = 0;
  });

  let totalSpent = 0;
  let expenseEntries = 0;

  transactions.forEach(tx => {
    if (tx.type === 'expense') {
      const amt = Number(tx.amount) || 0;
      totalSpent += amt;
      expenseEntries++;

      const key = String(tx.categoryKey || tx.category || 'other').toLowerCase();
      if (spending[key] !== undefined) {
        spending[key] += amt;
        counts[key]++;
      } else {
        spending.other += amt;
        counts.other++;
      }
    }
  });

  if (totalSpentEl) {
    totalSpentEl.textContent = `LKR ${formatNumber(totalSpent)}`;
  }

  let activeCategories = 0;
  EXPENSE_CATEGORY_KEYS.forEach(key => {
    if (spending[key] > 0) activeCategories++;
  });

  if (activeCountEl) {
    activeCountEl.textContent = activeCategories;
  }

  if (txCountEl) {
    txCountEl.textContent = expenseEntries;
  }

  if (emptyEl) {
    emptyEl.style.display = totalSpent > 0 ? 'none' : 'flex';
  }

  if (gridEl) {
    gridEl.innerHTML = '';

    EXPENSE_CATEGORY_KEYS.forEach(key => {
      const cat = CATEGORY_MAP[key];
      const value = spending[key];
      const count = counts[key];
      const pct = totalSpent > 0 ? (value / totalSpent) * 100 : 0;
      const isTop = value > 0 && value === Math.max(...EXPENSE_CATEGORY_KEYS.map(k => spending[k]));

      let pctLabel = 'No spending yet';
      if (value > 0) {
        pctLabel = `${Math.round(pct)}% of total spending${isTop ? ' — highest' : ''}`;
      }

      const article = document.createElement('article');
      article.className = 'category-card card';
      article.innerHTML = `
        <div class="category-icon icon-${key}">${cat.icon}</div>
        <div class="category-details">
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <span class="category-amount amount negative">LKR ${formatNumber(value)}</span>
        </div>
        <div class="progress-bar-container" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(cat.name)} spending progress">
          <div class="progress-bar-fill fill-${key}" style="--bar-width: ${pct.toFixed(1)}%; width: ${pct.toFixed(1)}%;"></div>
        </div>
        <div class="category-meta">
          <span class="category-pct">${pctLabel}</span>
          <span class="category-count">${count} ${count === 1 ? 'entry' : 'entries'}</span>
        </div>
        <a class="category-link" href="transactions.html?category=${encodeURIComponent(key)}">View transactions →</a>
      `;
      gridEl.appendChild(article);
    });
  }
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
// NOTE: escapeHtml() lives in js/auth.js (loaded before app.js) and is shared.

// Initialize components when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  initAddExpensePage();
  initTransactionsPage();
  initDashboardPage();
  initCategoriesPage();
});
