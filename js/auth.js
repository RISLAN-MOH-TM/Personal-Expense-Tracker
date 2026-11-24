/* =============================================================
   auth.js — Authentication, Session & User Management
   Handles:
   - User registration (Full name, Email, Password, Confirm Password)
   - User login (UserID/Email, Password)
   - Show/Hide Password toggles
   - Forgot Password modal & password reset
   - Session persistence in LocalStorage
   - Sidebar user profile rendering & Logout
   ============================================================= */

const USERS_STORAGE_KEY = 'expense_tracker_users_v1';
const CURRENT_USER_KEY  = 'expense_tracker_current_user_v1';

// -------------------------------------------------------------
// Storage Helpers
// -------------------------------------------------------------
function getUsers() {
  const data = localStorage.getItem(USERS_STORAGE_KEY);
  if (!data) {
    saveUsers([]);
    return [];
  }
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      const users = parsed.filter(user =>
        user.id !== 'user_1' &&
        user.id !== 'user_2' &&
        String(user.email || '').toLowerCase() !== 'nimal@gmail.com' &&
        String(user.email || '').toLowerCase() !== 'demo@expensetracker.lk'
      );
      saveUsers(users);
      localStorage.removeItem('expense_tracker_tx_user_1');
      localStorage.removeItem('expense_tracker_tx_user_2');
      return users;
    }
    saveUsers([]);
    return [];
  } catch (e) {
    saveUsers([]);
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function makeUniqueUsername(users, email) {
  const base = String(email.split('@')[0] || 'user')
    .replace(/[^a-z0-9._-]/gi, '')
    .toLowerCase() || 'user';

  let candidate = base;
  let counter = 1;
  while (users.some(u => String(u.username || '').toLowerCase() === candidate)) {
    candidate = `${base}${counter++}`;
  }
  return candidate;
}

function getCurrentUser() {
  // Persistent session (Remember me) or per-tab session
  const data = localStorage.getItem(CURRENT_USER_KEY) || sessionStorage.getItem(CURRENT_USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user, remember = true) {
  const serialized = JSON.stringify(user);
  if (remember) {
    localStorage.setItem(CURRENT_USER_KEY, serialized);
    sessionStorage.removeItem(CURRENT_USER_KEY);
  } else {
    sessionStorage.setItem(CURRENT_USER_KEY, serialized);
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  sessionStorage.removeItem(CURRENT_USER_KEY);
}

// -------------------------------------------------------------
// Password Visibility Toggle
// -------------------------------------------------------------
function setupPasswordToggles() {
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        this.innerHTML = '🙈';
        this.setAttribute('aria-label', 'Hide password');
        this.title = 'Hide password';
      } else {
        input.type = 'password';
        this.innerHTML = '👁️';
        this.setAttribute('aria-label', 'Show password');
        this.title = 'Show password';
      }
    });
  });
}

// -------------------------------------------------------------
// Login Page Controller
// -------------------------------------------------------------
function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  setupPasswordToggles();

  const alertBox = document.getElementById('auth-alert');
  const forgotLink = document.getElementById('forgot-password-link');
  const forgotModal = document.getElementById('forgot-modal');
  const closeForgotModal = document.getElementById('btn-close-forgot');
  const forgotForm = document.getElementById('forgot-form');
  const forgotAlert = document.getElementById('forgot-alert');

  function showAlert(msg, isSuccess = false) {
    if (!alertBox) return;
    alertBox.className = `auth-alert ${isSuccess ? 'auth-alert-success' : 'auth-alert-error'}`;
    alertBox.innerHTML = msg;
    alertBox.style.display = 'block';
  }

  // Handle Login submission
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const userIdInput = document.getElementById('userid');
    const pwdInput = document.getElementById('password');

    const userId = userIdInput ? userIdInput.value.trim().toLowerCase() : '';
    const password = pwdInput ? pwdInput.value : '';

    if (!userId) {
      showAlert('Please enter your User ID or Email.', false);
      userIdInput?.focus();
      return;
    }

    if (!password) {
      showAlert('Please enter your password.', false);
      pwdInput?.focus();
      return;
    }

    const users = getUsers();
    const matchedUser = users.find(u => {
      const email = String(u.email || '').toLowerCase();
      const username = String(u.username || '').toLowerCase();
      return (email === userId || (username && username === userId)) && u.password === password;
    });

    if (matchedUser) {
      const rememberInput = document.getElementById('remember-me');
      const remember = rememberInput ? rememberInput.checked : true;
      setCurrentUser(matchedUser, remember);
      showAlert(`✓ Welcome back, <strong>${escapeHtml(matchedUser.fullName)}</strong>! Redirecting to Dashboard…`, true);
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 700);
    } else {
      showAlert('❌ Invalid User ID or Password. Please check your credentials or click "Forgot Password".', false);
    }
  });

  // Forgot Password Modal
  if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', function (e) {
      e.preventDefault();
      forgotModal.style.display = 'flex';
      if (forgotAlert) forgotAlert.style.display = 'none';
      document.getElementById('reset-email')?.focus();
    });
  }

  if (closeForgotModal && forgotModal) {
    closeForgotModal.addEventListener('click', function () {
      forgotModal.style.display = 'none';
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const emailInput = document.getElementById('reset-email');
      const newPwdInput = document.getElementById('reset-new-password');
      const confirmPwdInput = document.getElementById('reset-confirm-password');

      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const newPwd = newPwdInput ? newPwdInput.value : '';
      const confirmPwd = confirmPwdInput ? confirmPwdInput.value : '';

      if (!email) {
        showModalAlert(forgotAlert, 'Please enter your registered email address.', false);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showModalAlert(forgotAlert, 'Please enter a valid email address (e.g. name@example.com).', false);
        return;
      }

      const users = getUsers();
      const userIndex = users.findIndex(u => String(u.email || '').toLowerCase() === email);

      if (userIndex === -1) {
        showModalAlert(forgotAlert, 'No account found with this email. Please check the spelling or register a new account.', false);
        return;
      }

      if (!newPwd || newPwd.length < 6) {
        showModalAlert(forgotAlert, 'New password must be at least 6 characters.', false);
        return;
      }

      if (newPwd !== confirmPwd) {
        showModalAlert(forgotAlert, 'New passwords do not match.', false);
        return;
      }

      // Update password
      users[userIndex].password = newPwd;
      saveUsers(users);

      showModalAlert(forgotAlert, '✓ Password reset successfully! You can now log in with your new password.', true);

      setTimeout(() => {
        forgotModal.style.display = 'none';
        const userInput = document.getElementById('userid');
        const pwdInput = document.getElementById('password');
        if (userInput) userInput.value = email;
        if (pwdInput) pwdInput.value = newPwd;
        showAlert('✓ Password updated! Click "Log In" to continue.', true);
      }, 1400);
    });
  }

  // Close modals when clicking backdrop
  window.addEventListener('click', function (e) {
    if (e.target === forgotModal) forgotModal.style.display = 'none';
  });
}

function showModalAlert(el, msg, isSuccess) {
  if (!el) return;
  el.className = `auth-alert ${isSuccess ? 'auth-alert-success' : 'auth-alert-error'}`;
  el.innerHTML = msg;
  el.style.display = 'block';
}

// -------------------------------------------------------------
// Register Page Controller
// -------------------------------------------------------------
function initRegisterPage() {
  const form = document.getElementById('register-form');
  if (!form) return;

  setupPasswordToggles();

  const alertBox = document.getElementById('auth-alert');
  const pwdInput = document.getElementById('reg-password');
  const confirmPwdInput = document.getElementById('reg-confirm-password');
  const matchHint = document.getElementById('pwd-match-hint');

  function showAlert(msg, isSuccess = false) {
    if (!alertBox) return;
    alertBox.className = `auth-alert ${isSuccess ? 'auth-alert-success' : 'auth-alert-error'}`;
    alertBox.innerHTML = msg;
    alertBox.style.display = 'block';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Real-time password match check
  function checkPasswordMatch() {
    if (!matchHint || !pwdInput || !confirmPwdInput) return;
    const pwd = pwdInput.value;
    const confirm = confirmPwdInput.value;

    if (!confirm) {
      matchHint.textContent = '';
      matchHint.className = 'pwd-match-hint';
      return;
    }

    if (pwd === confirm) {
      matchHint.textContent = '✓ Passwords match';
      matchHint.className = 'pwd-match-hint match';
    } else {
      matchHint.textContent = '✕ Passwords do not match';
      matchHint.className = 'pwd-match-hint mismatch';
    }
  }

  if (pwdInput) pwdInput.addEventListener('input', checkPasswordMatch);
  if (confirmPwdInput) confirmPwdInput.addEventListener('input', checkPasswordMatch);

  // Form submission
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const nameInput = document.getElementById('reg-fullname');
    const emailInput = document.getElementById('reg-email');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const password = pwdInput ? pwdInput.value : '';
    const confirmPassword = confirmPwdInput ? confirmPwdInput.value : '';

    // Validation
    if (!fullName || fullName.length < 2) {
      showAlert('Please enter your full name (at least 2 characters).', false);
      nameInput?.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showAlert('Please enter a valid email address (e.g. name@example.com).', false);
      emailInput?.focus();
      return;
    }

    if (!password || password.length < 6) {
      showAlert('Password must be at least 6 characters long.', false);
      pwdInput?.focus();
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Passwords do not match. Please re-enter your confirm password.', false);
      confirmPwdInput?.focus();
      return;
    }

    const users = getUsers();
    const existingUser = users.find(u => String(u.email || '').toLowerCase() === email);

    // If user is already registered: show clear button and message pointing to login
    if (existingUser) {
      showAlert(
        `⚠️ <strong>You are already registered!</strong> An account with <em>${escapeHtml(email)}</em> already exists. ` +
        `<br><br><a href="login.html" class="btn btn-primary" style="display:inline-block; margin-top:8px; padding:8px 16px; color:#fff; text-decoration:none; border-radius:6px;">Go to Log In Page →</a>`,
        false
      );
      return;
    }

    // Register new user
    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      fullName,
      email,
      username: makeUniqueUsername(users, email),
      password
    };

    users.push(newUser);
    saveUsers(users);
    setCurrentUser(newUser, true);

    // Initialize clean slate (empty transactions) for newly registered user
    localStorage.setItem('expense_tracker_tx_' + newUser.id, JSON.stringify([]));

    showAlert(
      `✓ Registration successful! Welcome, <strong>${escapeHtml(fullName)}</strong>. Setting up your dashboard…`,
      true
    );

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  });
}

// -------------------------------------------------------------
// Sidebar User Profile & Session Guard (Shared across Dashboard & Pages)
// -------------------------------------------------------------
function initSidebarUser() {
  const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');
  
  // If we are on an auth page, check if user is already logged in and show a banner
  if (isAuthPage) {
    const existing = getCurrentUser();
    const alertBox = document.getElementById('auth-alert');
    if (existing && alertBox) {
      alertBox.className = 'auth-alert auth-alert-success';
      alertBox.innerHTML = `👋 You are logged in as <strong>${escapeHtml(existing.fullName)}</strong> (${escapeHtml(existing.email)}). ` +
        `<a href="index.html" class="auth-footer-link" style="margin-left:6px;">Go to Dashboard →</a>`;
      alertBox.style.display = 'block';
    }
    return;
  }

  // Protected pages: check if user is logged in
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  let user = getCurrentUser();
  if (!user) {
    // Redirect unauthenticated visitor to login page
    window.location.href = 'login.html';
    return;
  }

  // Update greeting on Dashboard if element exists
  const subtitle = document.querySelector('.page-subtitle');
  if (subtitle && (window.location.pathname.includes('index.html') || !window.location.pathname.includes('.html'))) {
    subtitle.textContent = `Welcome back, ${user.fullName}! Here's your financial overview.`;
  }

  // Create or update sidebar user widget
  let userWidget = document.getElementById('sidebar-user-widget');
  if (!userWidget) {
    userWidget = document.createElement('div');
    userWidget.id = 'sidebar-user-widget';
    userWidget.className = 'sidebar-user';

    const footer = sidebar.querySelector('.sidebar-footer');
    if (footer) {
      sidebar.insertBefore(userWidget, footer);
    } else {
      sidebar.appendChild(userWidget);
    }
  }

  const initials = user.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  userWidget.innerHTML = `
    <div class="user-avatar" title="${escapeHtml(user.fullName)}">${initials}</div>
    <div class="user-details">
      <div class="user-name">${escapeHtml(user.fullName)}</div>
      <div class="user-email">${escapeHtml(user.email)}</div>
    </div>
    <button type="button" class="btn-logout" id="btn-sidebar-logout" title="Log out" aria-label="Log out">
      🚪
    </button>
  `;

  // Bind logout action
  const logoutBtn = document.getElementById('btn-sidebar-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm(`Are you sure you want to log out, ${user.fullName}?`)) {
        clearCurrentUser();
        window.location.href = 'login.html';
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auto-run on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
  initLoginPage();
  initRegisterPage();
  initSidebarUser();
});
