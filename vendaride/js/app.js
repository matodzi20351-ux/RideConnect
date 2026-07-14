document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- Theme toggle ---------- */
const themeBtn = document.getElementById('themeToggle');
themeBtn.addEventListener('click', () => {
  const body = document.body;
  const isDark = body.getAttribute('data-theme') === 'dark';
  body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeBtn.textContent = isDark ? '☀️' : '🌙';
});

/* ---------- Mobile burger -> simple dropdown toggle ---------- */
document.getElementById('burgerBtn').addEventListener('click', () => {
  const links = document.querySelector('.nav-links');
  links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
  links.style.position = 'absolute';
  links.style.top = '64px';
  links.style.right = '24px';
  links.style.flexDirection = 'column';
  links.style.background = 'var(--card)';
  links.style.border = '1px solid var(--border)';
  links.style.borderRadius = '14px';
  links.style.padding = '16px 22px';
  links.style.boxShadow = 'var(--shadow)';
});

/* ---------- Fare estimator ---------- */
const distSlider = document.getElementById('distSlider');
const distLabel = document.getElementById('distLabel');
const vehicleType = document.getElementById('vehicleType');
const fareAmount = document.getElementById('fareAmount');

function calcFare(){
  const dist = Number(distSlider.value);
  const mult = Number(vehicleType.value);
  const base = 15, perKm = 6;
  const fare = Math.round((base + dist * perKm) * mult);
  distLabel.textContent = dist;
  fareAmount.textContent = 'R ' + fare;
}
distSlider.addEventListener('input', calcFare);
vehicleType.addEventListener('change', calcFare);
calcFare();

/* ---------- Testimonials carousel ---------- */
const testimonials = [
  { text: 'Booked a ride at 11pm and my driver arrived in under 4 minutes. Felt completely safe the whole trip.', who: 'Lutendo M', loc: 'Thohoyandou' },
  { text: 'The upfront fare is what won me over — no more guessing what I\'ll pay at the end of the trip.', who: 'Wamashudu N.', loc: 'Tshakhuma' },
  { text: 'As a driver, the app is dead simple. I go online, get requests, and get paid. That\'s it.', who: 'Matodzi M.', loc: 'Tshivhulani' },
  { text: 'Being able to chat with my driver before pickup saved so much back-and-forth calling.', who: 'Lerato P.', loc: 'Itsani' }
];
let testiIndex = 0;
const testiText = document.getElementById('testiText');
const testiWho = document.getElementById('testiWho');
const testiDots = document.getElementById('testiDots');

testimonials.forEach((_, i) => {
  const dot = document.createElement('i');
  if (i === 0) dot.classList.add('active');
  dot.addEventListener('click', () => showTesti(i));
  testiDots.appendChild(dot);
});

function showTesti(i){
  testiIndex = i;
  const t = testimonials[i];
  document.getElementById('testiCard').style.opacity = 0;
  setTimeout(() => {
    testiText.textContent = '"' + t.text + '"';
    testiWho.innerHTML = t.who + '<span>' + t.loc + '</span>';
    [...testiDots.children].forEach((d, idx) => d.classList.toggle('active', idx === i));
    document.getElementById('testiCard').style.opacity = 1;
  }, 200);
}
setInterval(() => showTesti((testiIndex + 1) % testimonials.length), 5000);

/* ---------- FAQ accordion ---------- */
document.querySelectorAll('.faq-item').forEach(item => {
  item.querySelector('.faq-q').addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ---------- Auth modal ---------- */
const overlay = document.getElementById('authOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const nameField = document.getElementById('nameField');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const modalSwitch = document.getElementById('modalSwitch');
let currentMode = 'signup';

function openModal(mode){
  currentMode = mode;
  overlay.classList.add('show');
  if (mode === 'login'){
    modalTitle.textContent = 'Welcome back';
    modalSub.textContent = 'Log in to book your next ride.';
    nameField.style.display = 'none';
    authSubmitBtn.textContent = 'Log In';
    modalSwitch.innerHTML = '';
    modalSwitch.appendChild(document.createTextNode("Don't have an account? "));
    const link = document.createElement('a');
    link.textContent = 'Create one';
    link.addEventListener('click', () => openModal('signup'));
    modalSwitch.appendChild(link);
  } else {
    modalTitle.textContent = 'Create your account';
    modalSub.textContent = 'Join VendaRide and get moving in minutes.';
    nameField.style.display = 'block';
    authSubmitBtn.textContent = 'Create Account';
    modalSwitch.innerHTML = '';
    modalSwitch.appendChild(document.createTextNode('Already have an account? '));
    const link = document.createElement('a');
    link.textContent = 'Log in';
    link.addEventListener('click', () => openModal('login'));
    modalSwitch.appendChild(link);
  }
}
function closeModal(){ overlay.classList.remove('show'); }
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

function setRole(role){
  document.getElementById('roleRider').classList.toggle('active', role === 'rider');
  document.getElementById('roleDriver').classList.toggle('active', role === 'driver');
}

document.getElementById('authForm').addEventListener('submit', e => {
  e.preventDefault();
  closeModal();
  showToast(currentMode === 'login' ? 'Logged in! Welcome back to VendaRide.' : 'Account created! Welcome to VendaRide.');
  e.target.reset();
});

document.getElementById('contactForm').addEventListener('submit', e => {
  e.preventDefault();
  showToast("Message sent — we'll get back to you shortly.");
  e.target.reset();
});

/* ---------- Toast ---------- */
let toastTimer;
function showToast(msg){
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
