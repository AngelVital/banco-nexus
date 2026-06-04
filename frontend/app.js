/* ==========================================================================
   BANCO NEXUS JS - SINGLE PAGE APPLICATION CLIENT LOGIC
   ========================================================================== */

// API Base URL (Relative path for container/Nginx proxy compatibility)
const API_BASE = '/api';

// Application State
let state = {
  token: localStorage.getItem('token') || null,
  user: null,
  contacts: [],
  transactions: []
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  setupEventListeners();
  
  if (state.token) {
    validateTokenAndLoadApp();
  } else {
    showView('view-auth');
  }
  
  // Initialize Lucide Icons
  lucide.createIcons();
});

// Cache DOM Elements
let el = {};
function initElements() {
  el.viewAuth = document.getElementById('view-auth');
  el.viewLayout = document.getElementById('view-dashboard-layout');
  
  el.formLogin = document.getElementById('form-login');
  el.formRegister = document.getElementById('form-register');
  el.registerSuccess = document.getElementById('register-success');
  
  el.goToRegister = document.getElementById('go-to-register');
  el.goToLogin = document.getElementById('go-to-login');
  el.btnSuccessContinue = document.getElementById('btn-success-continue');
  el.newAccountNumber = document.getElementById('new-account-number');
  
  el.navItems = document.querySelectorAll('.nav-item');
  el.panels = document.querySelectorAll('.dashboard-panel');
  el.panelTitle = document.getElementById('panel-title');
  el.panelSubtitle = document.getElementById('panel-subtitle');
  
  el.userDisplayName = document.getElementById('user-display-name');
  el.userDisplayAccount = document.getElementById('user-display-account');
  el.userCardName = document.getElementById('user-card-name');
  el.userCardAccount = document.getElementById('user-card-account');
  el.balanceValue = document.getElementById('balance-value');
  
  el.btnLogout = document.getElementById('btn-logout');
  el.quickTransfer = document.getElementById('quick-transfer');
  el.quickAddContact = document.getElementById('quick-add-contact');
  el.quickRefreshBalance = document.getElementById('quick-refresh-balance');
  
  // Transactions
  el.transactionsList = document.getElementById('transactions-list');
  el.txSearch = document.getElementById('tx-search');
  
  // Transfer Panel
  el.formTransfer = document.getElementById('form-execute-transfer');
  el.transferContactSelect = document.getElementById('transfer-contact-select');
  el.transferDestAccount = document.getElementById('transfer-destination-account');
  el.transferAmount = document.getElementById('transfer-amount');
  el.transferAvailableBalance = document.getElementById('transfer-available-balance');
  el.transferConcept = document.getElementById('transfer-concept');
  
  // Contacts Panel
  el.formAddContact = document.getElementById('form-add-contact');
  el.contactsList = document.getElementById('contacts-list');
  el.contactAccount = document.getElementById('contact-account');
  el.contactAlias = document.getElementById('contact-alias');
  
  // Audit Panel
  el.auditList = document.getElementById('audit-list');
  el.btnRefreshAudit = document.getElementById('btn-refresh-audit');
}

// ==========================================================================
// TOAST ALERT SYSTEM (Movement and Audit Notification Alerts)
// ==========================================================================
function showToast(title, message, type = 'success', duration = 5000) {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <span class="toast-title">${title}</span>
      <span class="toast-msg">${message}</span>
    </div>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
    <div class="toast-progress"></div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons({ attrs: { class: 'toast-lucide' } });
  
  // Progress bar animation
  const progress = toast.querySelector('.toast-progress');
  progress.style.transition = `width ${duration}ms linear`;
  setTimeout(() => { progress.style.width = '0%'; }, 50);
  
  // Slide in animation
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 100);
  
  const removeToast = () => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  };
  
  // Auto remove
  const timeoutId = setTimeout(removeToast, duration);
  
  // Close button
  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timeoutId);
    removeToast();
  });
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // Auth Form Toggles
  el.goToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForms('register');
  });
  
  el.goToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForms('login');
  });
  
  // Register Success Card Continue
  el.btnSuccessContinue.addEventListener('click', () => {
    showView('view-dashboard');
    loadPanel('panel-summary');
  });
  
  // Forms Submissions
  el.formLogin.addEventListener('submit', handleLogin);
  el.formRegister.addEventListener('submit', handleRegister);
  el.formTransfer.addEventListener('submit', handleExecuteTransfer);
  el.formAddContact.addEventListener('submit', handleAddContact);
  
  // Logout
  el.btnLogout.addEventListener('click', logout);
  
  // Navigation
  el.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      
      // Update sidebar visual active state
      el.navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      loadPanel(target);
    });
  });
  
  // Quick actions
  el.quickTransfer.addEventListener('click', () => {
    const navTransfer = Array.from(el.navItems).find(n => n.getAttribute('data-target') === 'panel-transfer');
    if (navTransfer) navTransfer.click();
  });
  
  el.quickAddContact.addEventListener('click', () => {
    const navContacts = Array.from(el.navItems).find(n => n.getAttribute('data-target') === 'panel-contacts');
    if (navContacts) navContacts.click();
  });
  
  el.quickRefreshBalance.addEventListener('click', () => {
    fetchProfile();
    fetchTransactions();
    showToast('Actualizado', 'Datos de cuenta sincronizados', 'info', 2000);
  });
  
  // Transaction Search
  el.txSearch.addEventListener('input', filterTransactions);
  
  // Transfer Dropdown Contact Change
  el.transferContactSelect.addEventListener('change', (e) => {
    const selectedAccount = e.target.value;
    if (selectedAccount) {
      el.transferDestAccount.value = selectedAccount;
    }
  });

  // Refresh Audit Button
  el.btnRefreshAudit.addEventListener('click', () => {
    fetchAuditLogs();
    showToast('Bitácora sincronizada', 'Los logs de auditoría fueron actualizados', 'info', 2000);
  });
}

// ==========================================================================
// VIEW ROUTING & TRANSITIONS
// ==========================================================================
function showView(viewId) {
  if (viewId === 'view-auth') {
    el.viewLayout.classList.remove('active');
    el.viewLayout.style.display = 'none';
    
    el.viewAuth.style.display = 'flex';
    setTimeout(() => el.viewAuth.classList.add('active'), 50);
  } else {
    el.viewAuth.classList.remove('active');
    el.viewAuth.style.display = 'none';
    
    el.viewLayout.style.display = 'flex';
    setTimeout(() => el.viewLayout.classList.add('active'), 50);
  }
}

function toggleAuthForms(formType) {
  if (formType === 'register') {
    el.formLogin.classList.remove('active');
    setTimeout(() => {
      el.formLogin.style.display = 'none';
      el.formRegister.style.display = 'flex';
      setTimeout(() => el.formRegister.classList.add('active'), 50);
    }, 200);
  } else if (formType === 'login') {
    el.formRegister.classList.remove('active');
    el.registerSuccess.style.display = 'none';
    el.registerSuccess.classList.remove('active');
    setTimeout(() => {
      el.formRegister.style.display = 'none';
      el.formLogin.style.display = 'flex';
      setTimeout(() => el.formLogin.classList.add('active'), 50);
    }, 200);
  }
}

function loadPanel(panelId) {
  // Toggle Active Panels
  el.panels.forEach(panel => {
    panel.classList.remove('active');
  });
  
  const targetPanel = document.getElementById(panelId);
  targetPanel.classList.add('active');
  
  // Set headers dynamically
  switch(panelId) {
    case 'panel-summary':
      el.panelTitle.textContent = 'Posición Global';
      el.panelSubtitle.textContent = 'Resumen general de tu estado de cuenta y finanzas';
      fetchProfile();
      fetchTransactions();
      break;
    case 'panel-transfer':
      el.panelTitle.textContent = 'Transferir Fondos';
      el.panelSubtitle.textContent = 'Envía dinero de forma segura bajo consistencia transaccional ACID';
      fetchProfile(); // update local balance representation
      fetchContactsDropdown();
      break;
    case 'panel-contacts':
      el.panelTitle.textContent = 'Contactos Destino';
      el.panelSubtitle.textContent = 'Gestiona tus destinatarios frecuentes de forma rápida';
      fetchContacts();
      break;
    case 'panel-audit':
      el.panelTitle.textContent = 'Bitácora de Auditoría';
      el.panelSubtitle.textContent = 'Acceso al registro inmutable de transacciones y seguridad de tu cuenta';
      fetchAuditLogs();
      break;
  }
}

// ==========================================================================
// HTTP REQUESTS HELPERS
// ==========================================================================
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {})
  };
  
  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  };
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Ocurrió un error inesperado');
    }
    
    return data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err.message);
    throw err;
  }
}

// ==========================================================================
// AUTHENTICATION LOGIC
// ==========================================================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('token', res.token);
    
    // Update profile data in UI
    updateUIProfile();
    
    showToast('Inicio de sesión', 'Bienvenido de vuelta a Banco Nexus', 'success');
    
    showView('view-dashboard');
    loadPanel('panel-summary');
    
  } catch (err) {
    showToast('Error de Acceso', err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  try {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('token', res.token);
    
    updateUIProfile();
    
    // Show generated account number
    el.newAccountNumber.textContent = res.user.account_number;
    
    // Show Success Modal Card
    el.formRegister.classList.remove('active');
    setTimeout(() => {
      el.formRegister.style.display = 'none';
      el.registerSuccess.style.display = 'flex';
      setTimeout(() => el.registerSuccess.classList.add('active'), 50);
    }, 200);
    
    showToast('Registro Exitoso', 'Tu cuenta bancaria ha sido generada', 'success');
    
  } catch (err) {
    showToast('Error de Registro', err.message, 'error');
  }
}

async function validateTokenAndLoadApp() {
  try {
    // Attempt to load profile (acts as token validation)
    await fetchProfile();
    showView('view-dashboard');
    loadPanel('panel-summary');
  } catch (err) {
    // Token expired or invalid
    logout();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.contacts = [];
  state.transactions = [];
  localStorage.removeItem('token');
  
  // Reset forms
  el.formLogin.reset();
  el.formRegister.reset();
  
  // Show auth view
  toggleAuthForms('login');
  showView('view-auth');
  
  showToast('Sesión Cerrada', 'Has salido del simulador bancario de forma segura', 'info');
}

function updateUIProfile() {
  if (!state.user) return;
  
  el.userDisplayName.textContent = state.user.name;
  el.userDisplayAccount.textContent = `Cta: ${state.user.account_number}`;
  el.userCardName.textContent = state.user.name.toUpperCase();
  el.userCardAccount.textContent = `Cta: ${state.user.account_number}`;
  el.balanceValue.textContent = parseFloat(state.user.balance).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  el.transferAvailableBalance.textContent = `$${parseFloat(state.user.balance).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} MXN`;
}

// ==========================================================================
// PROFILE AND FINANCIAL INFORMATION
// ==========================================================================
async function fetchProfile() {
  try {
    const res = await apiRequest('/accounts/profile');
    state.user = res;
    updateUIProfile();
  } catch (err) {
    throw err;
  }
}

async function fetchTransactions() {
  try {
    const res = await apiRequest('/accounts/transactions');
    state.transactions = res;
    renderTransactions(res);
  } catch (err) {
    showToast('Error', 'No se pudo cargar el historial de movimientos', 'error');
  }
}

function renderTransactions(transactions) {
  if (transactions.length === 0) {
    el.transactionsList.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">
          <i data-lucide="inbox"></i>
          <span>No se encontraron movimientos registrados</span>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }
  
  el.transactionsList.innerHTML = transactions.map(tx => {
    const date = new Date(tx.created_at).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    const isDebit = tx.type === 'debit';
    const amountClass = isDebit ? 'tx-debit-val' : 'tx-credit-val';
    const amountPrefix = isDebit ? '-' : '+';
    
    let actionIcon = isDebit ? 'arrow-up-right' : 'arrow-down-left';
    let typeLabel = isDebit ? 'Cargo (Retiro)' : 'Abono (Depósito)';
    let relatedAccount = isDebit ? `Destino: ${tx.destination_account}` : `Origen: ${tx.source_account}`;
    
    return `
      <tr>
        <td>${date}</td>
        <td>
          <div style="font-weight: 600;">${tx.concept}</div>
        </td>
        <td style="font-family: monospace; letter-spacing: 0.5px;">${relatedAccount}</td>
        <td>
          <span class="badge-status ${isDebit ? 'failed' : 'success'}">
            <i data-lucide="${actionIcon}" style="width: 12px; height: 12px;"></i>
            <span>${typeLabel}</span>
          </span>
        </td>
        <td class="${amountClass}">${amountPrefix} $${parseFloat(tx.amount).toLocaleString('es-MX', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}</td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function filterTransactions() {
  const query = el.txSearch.value.toLowerCase();
  const filtered = state.transactions.filter(tx => {
    return (
      tx.concept.toLowerCase().includes(query) ||
      tx.source_account.includes(query) ||
      tx.destination_account.includes(query)
    );
  });
  renderTransactions(filtered);
}

// ==========================================================================
// TRANSFERS LOGIC
// ==========================================================================
async function fetchContactsDropdown() {
  try {
    const res = await apiRequest('/accounts/contacts');
    state.contacts = res;
    
    el.transferContactSelect.innerHTML = `
      <option value="">-- Seleccionar de agenda --</option>
      ${res.map(c => `<option value="${c.account_number}">${c.alias} (${c.contact_name || 'Desconocido'} - ${c.account_number})</option>`).join('')}
    `;
  } catch (err) {
    console.error('Error al cargar contactos para selector:', err.message);
  }
}

async function handleExecuteTransfer(e) {
  e.preventDefault();
  const destination_account = el.transferDestAccount.value;
  const amount = el.transferAmount.value;
  const concept = el.transferConcept.value;
  
  try {
    const res = await apiRequest('/transfers', {
      method: 'POST',
      body: JSON.stringify({ destination_account, amount, concept })
    });
    
    showToast('Transferencia Aprobada', `Se han enviado $${parseFloat(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} a la cuenta ${destination_account} exitosamente.`, 'success');
    
    // Clear Form
    el.formTransfer.reset();
    
    // Load summary and sync data
    loadPanel('panel-summary');
    
    // Update sidebar nav visually
    el.navItems.forEach(n => n.classList.remove('active'));
    el.navItems[0].classList.add('active'); // set Global Position active
    
  } catch (err) {
    showToast('Transferencia Rechazada', err.message, 'error');
  }
}

// ==========================================================================
// CONTACTS LOGIC
// ==========================================================================
async function fetchContacts() {
  try {
    const res = await apiRequest('/accounts/contacts');
    state.contacts = res;
    renderContacts(res);
  } catch (err) {
    showToast('Error', 'No se pudieron cargar los contactos', 'error');
  }
}

function renderContacts(contacts) {
  if (contacts.length === 0) {
    el.contactsList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i data-lucide="users"></i>
        <span>No tienes contactos guardados</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  el.contactsList.innerHTML = contacts.map(c => {
    // Get initial of contact name
    const initial = c.alias ? c.alias.charAt(0).toUpperCase() : 'C';
    
    return `
      <div class="contact-card">
        <div class="contact-header-info">
          <div class="contact-icon">${initial}</div>
          <div class="contact-det">
            <span class="alias">${c.alias}</span>
            <span class="full-name">${c.contact_name || 'Sin nombre'}</span>
          </div>
        </div>
        <div class="account">${c.account_number}</div>
        <button class="btn-contact-action" onclick="quickTransferTo('${c.account_number}')">
          <i data-lucide="send" style="width: 12px; height: 12px;"></i>
          <span>Transferir</span>
        </button>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// Global scope helper for clicking transfer from contact card
window.quickTransferTo = function(accountNumber) {
  const navTransfer = Array.from(el.navItems).find(n => n.getAttribute('data-target') === 'panel-transfer');
  if (navTransfer) {
    navTransfer.click();
    el.transferDestAccount.value = accountNumber;
    el.transferContactSelect.value = accountNumber;
  }
};

async function handleAddContact(e) {
  e.preventDefault();
  const account_number = el.contactAccount.value;
  const alias = el.contactAlias.value;
  
  try {
    const res = await apiRequest('/accounts/contacts', {
      method: 'POST',
      body: JSON.stringify({ account_number, alias })
    });
    
    showToast('Contacto Registrado', res.message, 'success');
    
    el.formAddContact.reset();
    fetchContacts();
    
  } catch (err) {
    showToast('Error al Agregar', err.message, 'error');
  }
}

// ==========================================================================
// AUDIT LOG LOGIC
// ==========================================================================
async function fetchAuditLogs() {
  try {
    const res = await apiRequest('/audit');
    renderAuditLogs(res);
  } catch (err) {
    showToast('Error', 'No se pudieron cargar los registros de auditoría', 'error');
  }
}

function renderAuditLogs(logs) {
  if (logs.length === 0) {
    el.auditList.innerHTML = `
      <tr class="empty-state">
        <td colspan="4">
          <i data-lucide="activity"></i>
          <span>No hay eventos registrados en la bitácora</span>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }
  
  el.auditList.innerHTML = logs.map(log => {
    const date = new Date(log.timestamp).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    
    let actionLabel = log.action;
    let actionClass = '';
    
    // Prettify actions
    switch (log.action) {
      case 'account_created':
        actionLabel = 'Apertura de Cuenta';
        actionClass = 'text-cyan';
        break;
      case 'login_success':
        actionLabel = 'Inicio de Sesión';
        actionClass = 'text-indigo';
        break;
      case 'login_failed':
        actionLabel = 'Intento de Acceso Fallido';
        actionClass = 'text-purple';
        break;
      case 'transfer_approved':
        actionLabel = 'Transferencia Enviada';
        actionClass = 'text-green';
        break;
      case 'transfer_rejected':
        actionLabel = 'Transferencia Rechazada';
        actionClass = 'text-red';
        break;
      case 'add_contact':
        actionLabel = 'Contacto Agregado';
        actionClass = 'text-cyan';
        break;
    }
    
    const isSuccess = log.status === 'success';
    
    return `
      <tr>
        <td style="white-space: nowrap; font-size: 13px;">${date}</td>
        <td class="${actionClass}" style="font-weight: 600;">${actionLabel}</td>
        <td>
          <span class="badge-status ${isSuccess ? 'success' : 'failed'}">
            <span>${log.status.toUpperCase()}</span>
          </span>
        </td>
        <td>
          <div class="audit-details-json">${JSON.stringify(log.detail, null, 2)}</div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}
