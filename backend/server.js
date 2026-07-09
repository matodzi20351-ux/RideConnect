require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { initSocket } = require('./sockets/socketHandler');

// Routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const driverRoutes = require('./routes/driver');
const adminRoutes = require('./routes/admin');
const tripRoutes = require('./routes/trip');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' } // tighten this to your app's actual origin(s) in production
});

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));


// ---------- Database ----------
connectDB();

// ---------- Socket.IO ----------
initSocket(io);

// Make io accessible inside route handlers via req.app.get('io') if needed
app.set('io', io);

// ---------- Routes ----------
app.get('/', (req, res) => {
  res.json({ message: 'RideConnect API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trips', tripRoutes);

// ---------- 404 handler ----------
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`RideConnect server running on port ${PORT}`);
});
