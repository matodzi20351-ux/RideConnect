/* ===================== STATE ===================== */
const state = {
  token: localStorage.getItem('rc_token') || null,
  user: JSON.parse(localStorage.getItem('rc_user') || 'null'),
  socket: null,
  pickup: null,       // { coordinates: [lng, lat], address }
  destination: null,  // { coordinates: [lng, lat], address }
  currentTrip: null,
  driverMarker: null,
  map: null,
  trackMap: null
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

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('rc_token', token);
  localStorage.setItem('rc_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rc_token');
  localStorage.removeItem('rc_user');
}

/* ===================== AUTH ===================== */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`${btn.dataset.tab}Form`).classList.add('active');
  });
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginMsg').textContent = '';
  try {
    const data = await api('/auth/login', 'POST', {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });
    if (data.user.role !== 'customer') {
      $('loginMsg').textContent = 'This app is for customers. Use the driver app to log in as a driver.';
      return;
    }
    saveSession(data.token, data.user);
    onLoggedIn();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
});

$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('registerMsg').textContent = '';
  try {
    const data = await api('/auth/register', 'POST', {
      name: $('regName').value.trim(),
      email: $('regEmail').value.trim(),
      phone: $('regPhone').value.trim(),
      password: $('regPassword').value,
      role: 'customer'
    });
    saveSession(data.token, data.user);
    onLoggedIn();
  } catch (err) {
    $('registerMsg').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', () => {
  if (state.socket) state.socket.disconnect();
  clearSession();
  location.reload();
});

/* ===================== SOCKET.IO ===================== */
function connectSocket() {
  state.socket = io(SOCKET_URL, { auth: { token: state.token } });

  state.socket.on('ride:noDriversFound', () => {
    $('bookingMsg').textContent = 'No nearby drivers found yet — keep waiting or try again shortly.';
  });

  state.socket.on('ride:driverAssigned', ({ tripId, driver }) => {
    if (!state.currentTrip || state.currentTrip._id !== tripId) return;
    state.currentTrip.driver = driver;
    $('driverName').textContent = driver.name;
    $('driverRating').textContent = `★ ${driver.rating?.average?.toFixed(1) ?? '5.0'}`;
    $('tripStatusBanner').textContent = 'Driver is on the way to pick you up';
    showView('view-tracking');
    initTrackingMap();
  });

  state.socket.on('driver:locationUpdated', ({ tripId, coordinates }) => {
    if (!state.currentTrip || state.currentTrip._id !== tripId || !state.trackMap) return;
    const latlng = [coordinates[1], coordinates[0]];
    if (state.driverMarker) {
      state.driverMarker.setLatLng(latlng);
    } else {
      state.driverMarker = L.marker(latlng, { title: 'Driver' }).addTo(state.trackMap);
    }
  });

  state.socket.on('trip:statusUpdated', ({ status }) => {
    const labels = {
      arrived: 'Your driver has arrived',
      ongoing: 'Trip in progress',
      completed: 'Trip completed',
      cancelled: 'Trip was cancelled'
    };
    $('tripStatusBanner').textContent = labels[status] || status;
    if (status === 'completed') {
      $('rateDriverName').textContent = state.currentTrip?.driver?.name || 'your driver';
      showView('view-rating');
    }
    if (status === 'cancelled') {
      resetToBooking();
    }
  });

  state.socket.on('chat:message', ({ message, sender, createdAt }) => {
    appendChatMessage(message, sender === state.user.id ? 'me' : 'them', createdAt);
  });
}

/* ===================== GEOLOCATION ===================== */
function getCurrentLocation() {
  $('pickupLabel').placeholder = 'Fetching your location...';
  if (!navigator.geolocation) {
    $('pickupLabel').placeholder = 'GPS not supported — tap the map to set pickup';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { longitude, latitude } = pos.coords;
      state.pickup = { coordinates: [longitude, latitude], address: 'Current location' };
      $('pickupLabel').value = `📍 Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
      if (state.map) {
        state.map.setView([latitude, longitude], 15);
        setPickupMarker([latitude, longitude]);
      }
    },
    () => {
      $('pickupLabel').placeholder = 'Could not get location — tap the map to set pickup';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
$('refreshLocationBtn').addEventListener('click', getCurrentLocation);

/* ===================== MAP (booking) ===================== */
let pickupMarkerRef, destMarkerRef;

function initBookingMap() {
  if (state.map) return;
  state.map = L.map('bookingMap').setView([-33.0153, 27.9116], 13); // East London, SA default
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.map.on('click', async (e) => {
    // Tapping the map sets destination (pickup comes from GPS)
    setDestMarker([e.latlng.lat, e.latlng.lng]);
    state.destination = { coordinates: [e.latlng.lng, e.latlng.lat], address: 'Dropped pin' };
    $('destInput').value = `📍 Pin (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
    await tryFareEstimate();
  });
}

function setPickupMarker(latlng) {
  if (pickupMarkerRef) pickupMarkerRef.setLatLng(latlng);
  else pickupMarkerRef = L.circleMarker(latlng, { radius: 8, color: '#2563eb', fillOpacity: 1 }).addTo(state.map);
}

function setDestMarker(latlng) {
  if (destMarkerRef) destMarkerRef.setLatLng(latlng);
  else destMarkerRef = L.marker(latlng).addTo(state.map);
}

// Simple address search using OpenStreetMap's free Nominatim geocoder
$('destInput').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const query = $('destInput').value.trim();
  if (!query || query.startsWith('📍')) return;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    const results = await res.json();
    if (!results.length) {
      $('bookingMsg').textContent = 'Address not found — try tapping the map instead.';
      return;
    }
    const { lat, lon, display_name } = results[0];
    state.destination = { coordinates: [Number(lon), Number(lat)], address: display_name };
    setDestMarker([Number(lat), Number(lon)]);
    state.map.setView([Number(lat), Number(lon)], 14);
    $('bookingMsg').textContent = '';
    await tryFareEstimate();
  } catch (err) {
    $('bookingMsg').textContent = 'Could not search that address right now.';
  }
});

async function tryFareEstimate() {
  if (!state.pickup || !state.destination) return;
  try {
    const est = await api('/customer/fare-estimate', 'POST', {
      pickup: { coordinates: state.pickup.coordinates },
      destination: { coordinates: state.destination.coordinates }
    });
    $('fareBox').classList.remove('hidden');
    $('fareAmount').textContent = `R${est.fareEstimate.toFixed(2)}`;
    $('fareDistance').textContent = `${est.distanceKm} km`;
    $('fareDuration').textContent = `${Math.round(est.estimatedDurationMin)} min`;
    $('requestRideBtn').disabled = false;
  } catch (err) {
    $('bookingMsg').textContent = err.message;
  }
}

/* ===================== REQUEST RIDE ===================== */
$('requestRideBtn').addEventListener('click', async () => {
  $('bookingMsg').textContent = '';
  try {
    const trip = (
      await api('/customer/request-ride', 'POST', {
        pickup: { coordinates: state.pickup.coordinates, address: state.pickup.address },
        destination: { coordinates: state.destination.coordinates, address: state.destination.address },
        paymentMethod: $('paymentMethod').value
      })
    ).trip;

    state.currentTrip = trip;
    state.socket.emit('ride:requested', { tripId: trip._id });
    showView('view-searching');
  } catch (err) {
    $('bookingMsg').textContent = err.message;
  }
});

$('cancelSearchBtn').addEventListener('click', async () => {
  if (!state.currentTrip) return resetToBooking();
  try {
    await api(`/customer/trips/${state.currentTrip._id}/cancel`, 'PATCH', { reason: 'Changed my mind' });
  } catch (err) {
    /* trip may already be gone — ignore */
  }
  resetToBooking();
});

$('cancelTripBtn').addEventListener('click', async () => {
  if (!state.currentTrip) return;
  if (!confirm('Cancel this trip?')) return;
  try {
    await api(`/customer/trips/${state.currentTrip._id}/cancel`, 'PATCH', { reason: 'Customer cancelled' });
    resetToBooking();
  } catch (err) {
    alert(err.message);
  }
});

function resetToBooking() {
  state.currentTrip = null;
  state.driverMarker = null;
  $('bookingMsg').textContent = '';
  $('fareBox').classList.add('hidden');
  $('requestRideBtn').disabled = true;
  showView('view-booking');
}

/* ===================== TRACKING MAP ===================== */
function initTrackingMap() {
  setTimeout(() => {
    if (!state.trackMap) {
      state.trackMap = L.map('trackingMap').setView(
        [state.pickup.coordinates[1], state.pickup.coordinates[0]],
        14
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(state.trackMap);
      L.circleMarker([state.pickup.coordinates[1], state.pickup.coordinates[0]], {
        radius: 8,
        color: '#2563eb',
        fillOpacity: 1
      }).addTo(state.trackMap);
      L.marker([state.destination.coordinates[1], state.destination.coordinates[0]]).addTo(state.trackMap);
    }
    state.trackMap.invalidateSize();
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

function appendChatMessage(text, who, timestamp) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${who}`;
  div.textContent = text;
  $('chatMessages').appendChild(div);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

/* ===================== RATING ===================== */
let selectedRating = 0;
document.querySelectorAll('#starPicker span').forEach((star) => {
  star.addEventListener('click', () => {
    selectedRating = Number(star.dataset.star);
    document.querySelectorAll('#starPicker span').forEach((s, i) => {
      s.classList.toggle('filled', i < selectedRating);
    });
    $('submitRatingBtn').disabled = false;
  });
});

$('submitRatingBtn').addEventListener('click', async () => {
  try {
    await api(`/customer/trips/${state.currentTrip._id}/rate-driver`, 'POST', { rating: selectedRating });
  } catch (err) {
    /* non-fatal */
  }
  finishTripFlow();
});

$('skipRatingBtn').addEventListener('click', finishTripFlow);

function finishTripFlow() {
  selectedRating = 0;
  document.querySelectorAll('#starPicker span').forEach((s) => s.classList.remove('filled'));
  $('submitRatingBtn').disabled = true;
  $('chatMessages').innerHTML = '';
  destMarkerRef = null;
  if (state.trackMap) {
    state.trackMap.remove();
    state.trackMap = null;
  }
  resetToBooking();
}

/* ===================== BOOTSTRAP ===================== */
function onLoggedIn() {
  $('userBadge').classList.remove('hidden');
  $('userName').textContent = state.user.name;
  showView('view-booking');
  connectSocket();
  initBookingMap();
  getCurrentLocation();
}

(function init() {
  if (state.token && state.user) {
    onLoggedIn();
  } else {
    showView('view-auth');
  }
})();
