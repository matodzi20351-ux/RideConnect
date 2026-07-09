/* ===================== STATE ===================== */
const state = {
  token: localStorage.getItem('rc_driver_token') || null,
  user: JSON.parse(localStorage.getItem('rc_driver_user') || 'null'),
  socket: null,
  isOnline: false,
  currentLocation: null, // [lng, lat]
  currentTrip: null,
  dashMap: null,
  tripMap: null,
  driverMarkerOnDash: null,
  watchId: null,
  pollTimer: null
};

/* ===================== HELPERS ===================== */
function $(id) { return document.getElementById(id); }

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('rc_driver_token', token);
  localStorage.setItem('rc_driver_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rc_driver_token');
  localStorage.removeItem('rc_driver_user');
}

/* ===================== AUTH TABS ===================== */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`${btn.dataset.tab}Form`).classList.add('active');
  });
});

/* ===================== LOGIN ===================== */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginMsg').textContent = '';
  try {
    const data = await api('/auth/login', 'POST', {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });
    if (data.user.role !== 'driver') {
      $('loginMsg').textContent = 'This app is for drivers. Use the customer app if you are a passenger.';
      return;
    }
    saveSession(data.token, data.user);
    await routeAfterLogin();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
});

/* ===================== REGISTER ===================== */
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('registerMsg').textContent = '';
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  try {
    const licenseImageUrl = await fileToBase64($('licensePhoto').files[0]);
    const vehiclePhotoUrl = await fileToBase64($('vehPhoto').files[0]);

    const data = await api('/auth/register', 'POST', {
      name: $('regName').value.trim(),
      email: $('regEmail').value.trim(),
      phone: $('regPhone').value.trim(),
      password: $('regPassword').value,
      role: 'driver',
      driverDetails: {
        licenseNumber: $('licenseNumber').value.trim(),
        licenseImageUrl,
        licenseExpiry: $('licenseExpiry').value,
        vehicle: {
          make: $('vehMake').value.trim(),
          model: $('vehModel').value.trim(),
          year: Number($('vehYear').value),
          color: $('vehColor').value.trim(),
          plateNumber: $('vehPlate').value.trim(),
          vehicleType: $('vehType').value,
          vehiclePhotoUrl
        }
      }
    });

    saveSession(data.token, data.user);
    await routeAfterLogin();
  } catch (err) {
    $('registerMsg').textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register as Driver';
  }
});

$('logoutBtn').addEventListener('click', () => {
  stopEverything();
  clearSession();
  location.reload();
});

/* ===================== ROUTING AFTER LOGIN ===================== */
async function routeAfterLogin() {
  $('userBadge').classList.remove('hidden');
  $('userName').textContent = state.user.name;

  let profile;
  try {
    profile = (await api('/driver/profile')).profile;
  } catch (err) {
    showView('view-pending');
    return;
  }

  if (!profile || profile.approvalStatus !== 'approved') {
    $('pendingTitle').textContent =
      profile?.approvalStatus === 'rejected' ? 'Application not approved' : 'Your account is pending approval';
    $('pendingMsg').textContent =
      profile?.approvalStatus === 'rejected'
        ? profile.rejectionReason || 'Please contact support for details.'
        : 'An admin needs to review your license and vehicle details before you can start driving. Check back soon.';
    showView('view-pending');
    return;
  }

  connectSocket();
  showView('view-dashboard');
  initDashMap();
  refreshEarnings();
  startLocationWatch();
}

$('pendingRefreshBtn').addEventListener('click', routeAfterLogin);

/* ===================== SOCKET.IO ===================== */
function connectSocket() {
  if (state.socket) return;
  state.socket = io(SOCKET_URL, { auth: { token: state.token } });

  state.socket.on('ride:newRequest', ({ trip }) => {
    if (!state.isOnline || state.currentTrip) return; // already busy
    showRequestModal(trip);
  });

  state.socket.on('chat:message', ({ message, sender }) => {
    appendChatMessage(message, sender === state.user.id ? 'me' : 'them');
  });
}

/* ===================== LOCATION TRACKING ===================== */
function startLocationWatch() {
  if (!navigator.geolocation || state.watchId) return;
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coordinates = [pos.coords.longitude, pos.coords.latitude];
      state.currentLocation = coordinates;

      if (state.dashMap) {
        const latlng = [coordinates[1], coordinates[0]];
        if (state.driverMarkerOnDash) state.driverMarkerOnDash.setLatLng(latlng);
        else state.driverMarkerOnDash = L.circleMarker(latlng, { radius: 8, color: '#16a34a', fillOpacity: 1 }).addTo(state.dashMap);
        if (!state.currentTrip) state.dashMap.panTo(latlng);
      }

      if (state.socket) {
        state.socket.emit('driver:locationUpdate', {
          coordinates,
          tripId: state.currentTrip?._id
        });
      }
    },
    (err) => console.warn('Geolocation error:', err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopEverything() {
  if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.socket) state.socket.disconnect();
}

/* ===================== ONLINE / OFFLINE ===================== */
$('onlineToggle').addEventListener('change', async (e) => {
  const goingOnline = e.target.checked;
  try {
    if (!state.currentLocation) {
      alert('Waiting for your GPS location — try again in a moment.');
      e.target.checked = false;
      return;
    }
    await api('/driver/status', 'PATCH', { isOnline: goingOnline, coordinates: state.currentLocation });
    state.isOnline = goingOnline;
    $('onlineStatusText').textContent = goingOnline ? 'Online' : 'Offline';
    $('onlineStatusText').className = `online-status ${goingOnline ? 'online' : 'offline'}`;

    if (goingOnline) startNearbyPolling();
    else {
      if (state.pollTimer) clearInterval(state.pollTimer);
      $('requestsList').innerHTML = '';
    }
  } catch (err) {
    alert(err.message);
    e.target.checked = !goingOnline;
  }
});

/* ===================== NEARBY REQUESTS (list, polled) ===================== */
function startNearbyPolling() {
  refreshNearby();
  state.pollTimer = setInterval(refreshNearby, 8000);
}

async function refreshNearby() {
  if (!state.isOnline || state.currentTrip) return;
  try {
    const { trips } = await api('/driver/nearby-requests?radiusKm=8');
    renderRequestsList(trips);
  } catch (err) {
    $('dashboardMsg').textContent = err.message;
  }
}

function renderRequestsList(trips) {
  const list = $('requestsList');
  list.innerHTML = '';
  if (!trips.length) {
    list.innerHTML = '<p class="muted">No nearby ride requests right now.</p>';
    return;
  }
  trips.forEach((trip) => {
    const item = document.createElement('div');
    item.className = 'request-item';
    item.innerHTML = `
      <div>
        <div class="req-customer">${trip.customer?.name || 'Passenger'}</div>
        <div class="muted">${trip.distanceKm} km · R${trip.fareEstimate.toFixed(2)}</div>
      </div>
      <button class="btn-primary btn-small">Accept</button>
    `;
    item.querySelector('button').addEventListener('click', () => acceptTrip(trip));
    list.appendChild(item);
  });
}

/* ===================== REQUEST MODAL (real-time push) ===================== */
let modalTrip = null;

function showRequestModal(trip) {
  modalTrip = trip;
  $('reqCustomerName').textContent = `Passenger: ${trip.customer?.name || 'Unknown'}`;
  $('reqFareInfo').textContent = `${trip.distanceKm} km · R${trip.fareEstimate.toFixed(2)} estimated fare`;
  $('requestModal').classList.remove('hidden');
}

$('declineReqBtn').addEventListener('click', () => {
  $('requestModal').classList.add('hidden');
  modalTrip = null;
});

$('acceptReqBtn').addEventListener('click', () => {
  if (modalTrip) acceptTrip(modalTrip);
  $('requestModal').classList.add('hidden');
});

/* ===================== ACCEPT / TRIP LIFECYCLE ===================== */
async function acceptTrip(trip) {
  try {
    const accepted = (await api(`/driver/trips/${trip._id}/accept`, 'PATCH')).trip;
    state.currentTrip = accepted;
    state.socket.emit('ride:accepted', { tripId: accepted._id });
    if (state.pollTimer) clearInterval(state.pollTimer);
    $('requestModal').classList.add('hidden');
    enterTripView(accepted, trip.customer);
  } catch (err) {
    alert(err.message || 'This trip may have already been taken by another driver.');
    refreshNearby();
  }
}

function enterTripView(trip, customer) {
  $('tripCustomerName').textContent = customer?.name || 'Passenger';
  $('tripCustomerRating').textContent = `★ ${customer?.rating?.average?.toFixed(1) ?? '5.0'}`;
  $('tripPhaseLabel').textContent = 'En route to pickup';
  $('tripActionBtn').textContent = 'Arrived at Pickup';
  $('tripActionBtn').dataset.phase = 'accepted';
  showView('view-trip');
  initTripMap(trip);
}

$('tripActionBtn').addEventListener('click', async () => {
  const phase = $('tripActionBtn').dataset.phase;
  try {
    if (phase === 'accepted') {
      await api(`/driver/trips/${state.currentTrip._id}/arrived`, 'PATCH');
      state.socket.emit('trip:statusChanged', { tripId: state.currentTrip._id, status: 'arrived' });
      $('tripPhaseLabel').textContent = 'Waiting at pickup point';
      $('tripActionBtn').textContent = 'Start Trip';
      $('tripActionBtn').dataset.phase = 'arrived';
    } else if (phase === 'arrived') {
      await api(`/driver/trips/${state.currentTrip._id}/start`, 'PATCH');
      state.socket.emit('trip:statusChanged', { tripId: state.currentTrip._id, status: 'ongoing' });
      $('tripPhaseLabel').textContent = 'Trip in progress';
      $('tripActionBtn').textContent = 'Complete Trip';
      $('tripActionBtn').dataset.phase = 'ongoing';
    } else if (phase === 'ongoing') {
      const result = await api(`/driver/trips/${state.currentTrip._id}/complete`, 'PATCH', {});
      state.socket.emit('trip:statusChanged', { tripId: state.currentTrip._id, status: 'completed' });
      alert(`Trip complete! You earned R${result.trip.finalFare.toFixed(2)}`);
      exitTripView();
    }
  } catch (err) {
    alert(err.message);
  }
});

function exitTripView() {
  state.currentTrip = null;
  $('chatMessages').innerHTML = '';
  $('chatPanel').classList.add('hidden');
  if (state.tripMap) {
    state.tripMap.remove();
    state.tripMap = null;
  }
  showView('view-dashboard');
  refreshEarnings();
  if (state.isOnline) startNearbyPolling();
}

/* ===================== MAPS ===================== */
function initDashMap() {
  if (state.dashMap) return;
  const start = state.currentLocation
    ? [state.currentLocation[1], state.currentLocation[0]]
    : [-33.0153, 27.9116]; // East London, SA default
  state.dashMap = L.map('dashMap').setView(start, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.dashMap);
}

function initTripMap(trip) {
  setTimeout(() => {
    if (state.tripMap) state.tripMap.remove();
    state.tripMap = L.map('tripMap').setView([trip.pickup.coordinates[1], trip.pickup.coordinates[0]], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.tripMap);
    L.marker([trip.pickup.coordinates[1], trip.pickup.coordinates[0]])
      .addTo(state.tripMap)
      .bindPopup('Pickup');
    L.marker([trip.destination.coordinates[1], trip.destination.coordinates[0]])
      .addTo(state.tripMap)
      .bindPopup('Destination');
    if (state.currentLocation) {
      L.circleMarker([state.currentLocation[1], state.currentLocation[0]], {
        radius: 8, color: '#16a34a', fillOpacity: 1
      }).addTo(state.tripMap);
    }
  }, 100);
}

/* ===================== CHAT ===================== */
$('chatToggleBtn').addEventListener('click', () => $('chatPanel').classList.toggle('hidden'));
$('closeChatBtn').addEventListener('click', () => $('chatPanel').classList.add('hidden'));

$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (!text || !state.currentTrip) return;
  state.socket.emit('chat:send', { tripId: state.currentTrip._id, message: text });
  $('chatInput').value = '';
});

function appendChatMessage(text, who) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${who}`;
  div.textContent = text;
  $('chatMessages').appendChild(div);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

/* ===================== EARNINGS ===================== */
async function refreshEarnings() {
  try {
    const data = await api('/driver/earnings');
    $('earningsTotal').textContent = `R${(data.earnings?.total || 0).toFixed(2)}`;
    $('tripsTotal').textContent = data.totalTrips || 0;
  } catch (err) { /* non-fatal */ }
}

/* ===================== BOOTSTRAP ===================== */
(function init() {
  if (state.token && state.user) {
    routeAfterLogin();
  } else {
    showView('view-auth');
  }
})();
