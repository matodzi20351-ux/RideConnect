/* ===================== STATE ===================== */
const state = {
  token: localStorage.getItem('rc_admin_token') || null,
  user: JSON.parse(localStorage.getItem('rc_admin_user') || 'null'),
  liveMap: null,
  liveMarkers: []
};

/* ===================== HELPERS ===================== */
function $(id) { return document.getElementById(id); }

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('rc_admin_token', token);
  localStorage.setItem('rc_admin_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rc_admin_token');
  localStorage.removeItem('rc_admin_user');
}

/* ===================== LOGIN ===================== */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginMsg').textContent = '';
  try {
    const data = await api('/auth/login', 'POST', {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });
    if (data.user.role !== 'admin') {
      $('loginMsg').textContent = 'This login is not an admin account.';
      return;
    }
    saveSession(data.token, data.user);
    enterDashboard();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', () => {
  clearSession();
  location.reload();
});

/* ===================== TAB NAVIGATION ===================== */
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');

    if (btn.dataset.tab === 'overview') loadOverview();
    if (btn.dataset.tab === 'drivers') loadDrivers();
    if (btn.dataset.tab === 'customers') loadCustomers();
    if (btn.dataset.tab === 'trips') loadLiveTrips();
    if (btn.dataset.tab === 'pricing') loadPricing();
    if (btn.dataset.tab === 'complaints') loadComplaints();
  });
});

/* ===================== OVERVIEW ===================== */
async function loadOverview() {
  try {
    const s = await api('/admin/reports/summary');
    $('statGrid').innerHTML = `
      <div class="stat-card"><div class="stat-num">${s.totalCustomers}</div><div class="stat-label">Customers</div></div>
      <div class="stat-card"><div class="stat-num">${s.totalDrivers}</div><div class="stat-label">Drivers</div></div>
      <div class="stat-card"><div class="stat-num">${s.approvedDrivers}</div><div class="stat-label">Approved Drivers</div></div>
      <div class="stat-card"><div class="stat-num">${s.totalTrips}</div><div class="stat-label">Total Trips</div></div>
      <div class="stat-card"><div class="stat-num">${s.completedTrips}</div><div class="stat-label">Completed Trips</div></div>
      <div class="stat-card highlight"><div class="stat-num">R${s.totalRevenue.toFixed(2)}</div><div class="stat-label">Total Revenue</div></div>
    `;
  } catch (err) {
    $('statGrid').innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* ===================== DRIVERS ===================== */
$('driverStatusFilter').addEventListener('change', loadDrivers);

async function loadDrivers() {
  const wrap = $('driversTableWrap');
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const status = $('driverStatusFilter').value;
    const { drivers } = await api(`/admin/drivers${status ? `?status=${status}` : ''}`);

    if (!drivers.length) {
      wrap.innerHTML = '<p class="muted">No drivers found.</p>';
      return;
    }

    const rows = drivers.map((d) => `
      <tr>
        <td>${d.user?.name || '—'}</td>
        <td>${d.user?.email || '—'}</td>
        <td>${d.vehicle.make} ${d.vehicle.model} (${d.vehicle.plateNumber})</td>
        <td><span class="badge badge-${d.approvalStatus}">${d.approvalStatus}</span></td>
        <td>${d.user?.isSuspended ? '<span class="badge badge-rejected">Suspended</span>' : '<span class="badge badge-approved">Active</span>'}</td>
        <td class="actions">
          ${d.approvalStatus !== 'approved' ? `<button class="btn-small btn-approve" data-id="${d._id}">Approve</button>` : ''}
          ${d.approvalStatus !== 'rejected' ? `<button class="btn-small btn-reject" data-id="${d._id}">Reject</button>` : ''}
          ${d.user
            ? d.user.isSuspended
              ? `<button class="btn-small btn-unsuspend" data-userid="${d.user._id}">Unsuspend</button>`
              : `<button class="btn-small btn-suspend" data-userid="${d.user._id}">Suspend</button>`
            : ''}
        </td>
      </tr>
    `).join('');

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Vehicle</th><th>Approval</th><th>Account</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    wrap.querySelectorAll('.btn-approve').forEach((b) =>
      b.addEventListener('click', () => driverAction(b.dataset.id, 'approve'))
    );
    wrap.querySelectorAll('.btn-reject').forEach((b) =>
      b.addEventListener('click', () => {
        const reason = prompt('Reason for rejection (optional):') || '';
        driverAction(b.dataset.id, 'reject', reason);
      })
    );
    wrap.querySelectorAll('.btn-suspend').forEach((b) =>
      b.addEventListener('click', () => userAction(b.dataset.userid, 'suspend'))
    );
    wrap.querySelectorAll('.btn-unsuspend').forEach((b) =>
      b.addEventListener('click', () => userAction(b.dataset.userid, 'unsuspend'))
    );
  } catch (err) {
    wrap.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

async function driverAction(driverProfileId, action, reason = '') {
  try {
    await api(`/admin/drivers/${driverProfileId}/${action}`, 'PATCH', reason ? { reason } : null);
    loadDrivers();
  } catch (err) {
    alert(err.message);
  }
}

async function userAction(userId, action) {
  try {
    await api(`/admin/users/${userId}/${action}`, 'PATCH');
    loadDrivers();
    loadCustomers();
  } catch (err) {
    alert(err.message);
  }
}

/* ===================== CUSTOMERS ===================== */
async function loadCustomers() {
  const wrap = $('customersTableWrap');
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { customers } = await api('/admin/customers');
    if (!customers.length) {
      wrap.innerHTML = '<p class="muted">No customers yet.</p>';
      return;
    }

    const rows = customers.map((c) => `
      <tr>
        <td>${c.name}</td>
        <td>${c.email}</td>
        <td>${c.phone}</td>
        <td>★ ${c.rating?.average?.toFixed(1) ?? '5.0'}</td>
        <td>${c.isSuspended ? '<span class="badge badge-rejected">Suspended</span>' : '<span class="badge badge-approved">Active</span>'}</td>
        <td class="actions">
          ${c.isSuspended
            ? `<button class="btn-small btn-unsuspend" data-userid="${c._id}">Unsuspend</button>`
            : `<button class="btn-small btn-suspend" data-userid="${c._id}">Suspend</button>`}
        </td>
      </tr>
    `).join('');

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Rating</th><th>Account</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    wrap.querySelectorAll('.btn-suspend').forEach((b) =>
      b.addEventListener('click', () => userAction(b.dataset.userid, 'suspend'))
    );
    wrap.querySelectorAll('.btn-unsuspend').forEach((b) =>
      b.addEventListener('click', () => userAction(b.dataset.userid, 'unsuspend'))
    );
  } catch (err) {
    wrap.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* ===================== LIVE TRIPS ===================== */
async function loadLiveTrips() {
  const wrap = $('liveTripsTableWrap');
  wrap.innerHTML = '<p class="muted">Loading...</p>';

  if (!state.liveMap) {
    state.liveMap = L.map('liveMap').setView([-33.0153, 27.9116], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.liveMap);
  }
  setTimeout(() => state.liveMap.invalidateSize(), 100);

  try {
    const { trips } = await api('/admin/trips/live');

    state.liveMarkers.forEach((m) => state.liveMap.removeLayer(m));
    state.liveMarkers = [];

    if (!trips.length) {
      wrap.innerHTML = '<p class="muted">No trips currently in progress.</p>';
      return;
    }

    trips.forEach((trip) => {
      const marker = L.marker([trip.pickup.coordinates[1], trip.pickup.coordinates[0]])
        .addTo(state.liveMap)
        .bindPopup(`${trip.customer?.name || 'Customer'} → ${trip.driver?.name || 'Driver'} (${trip.status})`);
      state.liveMarkers.push(marker);
    });

    const rows = trips.map((t) => `
      <tr>
        <td>${t.customer?.name || '—'}</td>
        <td>${t.driver?.name || '—'}</td>
        <td><span class="badge badge-approved">${t.status}</span></td>
        <td>${t.distanceKm} km</td>
        <td>R${t.fareEstimate.toFixed(2)}</td>
      </tr>
    `).join('');

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Customer</th><th>Driver</th><th>Status</th><th>Distance</th><th>Fare</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* ===================== PRICING ===================== */
async function loadPricing() {
  $('pricingMsg').textContent = '';
  try {
    const { config } = await api('/admin/pricing');
    $('baseFare').value = config.baseFare;
    $('costPerKm').value = config.costPerKm;
    $('costPerMin').value = config.costPerMin;
    $('minimumFare').value = config.minimumFare;
    $('cancellationFee').value = config.cancellationFee;
  } catch (err) {
    $('pricingMsg').textContent = err.message;
  }
}

$('pricingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pricingMsg').textContent = '';
  try {
    await api('/admin/pricing', 'PUT', {
      baseFare: Number($('baseFare').value),
      costPerKm: Number($('costPerKm').value),
      costPerMin: Number($('costPerMin').value),
      minimumFare: Number($('minimumFare').value),
      cancellationFee: Number($('cancellationFee').value)
    });
    $('pricingMsg').textContent = 'Pricing updated successfully.';
    $('pricingMsg').className = 'form-msg success';
  } catch (err) {
    $('pricingMsg').textContent = err.message;
    $('pricingMsg').className = 'form-msg';
  }
});

/* ===================== COMPLAINTS ===================== */
$('complaintStatusFilter').addEventListener('change', loadComplaints);

async function loadComplaints() {
  const wrap = $('complaintsTableWrap');
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const status = $('complaintStatusFilter').value;
    const { complaints } = await api(`/admin/complaints${status ? `?status=${status}` : ''}`);

    if (!complaints.length) {
      wrap.innerHTML = '<p class="muted">No complaints found.</p>';
      return;
    }

    const rows = complaints.map((c) => `
      <tr>
        <td>${c.filedBy?.name || '—'} <span class="muted">(${c.filedBy?.role || ''})</span></td>
        <td>${c.against?.name || '—'}</td>
        <td>${c.category}</td>
        <td class="desc-cell">${c.description}</td>
        <td>
          <select class="status-select" data-id="${c._id}">
            <option value="open" ${c.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="investigating" ${c.status === 'investigating' ? 'selected' : ''}>Investigating</option>
            <option value="resolved" ${c.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="dismissed" ${c.status === 'dismissed' ? 'selected' : ''}>Dismissed</option>
          </select>
        </td>
      </tr>
    `).join('');

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Filed By</th><th>Against</th><th>Category</th><th>Description</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    wrap.querySelectorAll('.status-select').forEach((sel) =>
      sel.addEventListener('change', async () => {
        try {
          await api(`/admin/complaints/${sel.dataset.id}`, 'PATCH', { status: sel.value });
        } catch (err) {
          alert(err.message);
        }
      })
    );
  } catch (err) {
    wrap.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* ===================== BOOTSTRAP ===================== */
function enterDashboard() {
  $('view-auth').classList.add('hidden');
  $('view-dashboard').classList.remove('hidden');
  loadOverview();
}

(function init() {
  if (state.token && state.user) enterDashboard();
})();
