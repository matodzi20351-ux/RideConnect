const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const Trip = require('../models/Trip');
const ChatMessage = require('../models/ChatMessage');

/**
 * In-memory map of userId -> socket.id.
 * Fine for a single server instance / small-scale project.
 * For multi-server deployments, swap this for a Redis-backed adapter.
 */
const onlineUsers = new Map();

function initSocket(io) {
  // Authenticate every socket connection using the same JWT as the REST API
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    onlineUsers.set(userId, socket.id);
    console.log(`Socket connected: ${socket.user.name} (${socket.user.role})`);

    // Join a personal room so we can target this user directly by ID
    socket.join(`user:${userId}`);

    // ---------- Driver: live location broadcast ----------
    // Driver app calls this every few seconds while online / on a trip
    socket.on('driver:locationUpdate', async ({ coordinates, tripId }) => {
      if (socket.user.role !== 'driver' || !coordinates) return;

      await DriverProfile.findOneAndUpdate(
        { user: userId },
        { currentLocation: { type: 'Point', coordinates } }
      );

      // If currently on a trip, push the update straight to that customer
      if (tripId) {
        const trip = await Trip.findById(tripId);
        if (trip) {
          io.to(`user:${trip.customer.toString()}`).emit('driver:locationUpdated', {
            tripId,
            coordinates
          });
        }
      }
    });

    // ---------- Customer: request a ride ----------
    // Expects the trip to already exist (created via POST /api/customer/request-ride).
    // This event fans the request out to nearby online, approved drivers.
    socket.on('ride:requested', async ({ tripId }) => {
      try {
        const trip = await Trip.findById(tripId);
        if (!trip || trip.status !== 'requested') return;

        const [lng, lat] = trip.pickup.coordinates;

        const nearbyDrivers = await DriverProfile.find({
          approvalStatus: 'approved',
          isOnline: true,
          currentLocation: {
            $near: {
              $geometry: { type: 'Point', coordinates: [lng, lat] },
              $maxDistance: 5000 // 5km radius
            }
          }
        }).limit(10);

        nearbyDrivers.forEach((driverProfile) => {
          io.to(`user:${driverProfile.user.toString()}`).emit('ride:newRequest', { trip });
        });

        if (nearbyDrivers.length === 0) {
          socket.emit('ride:noDriversFound', { tripId });
        }
      } catch (err) {
        socket.emit('error', { message: 'Could not broadcast ride request', error: err.message });
      }
    });

    // ---------- Driver: accept a ride (real-time confirmation) ----------
    // The authoritative accept happens via PATCH /api/driver/trips/:id/accept
    // (atomic, prevents double-accept). This event just notifies the customer
    // once that REST call has succeeded.
    socket.on('ride:accepted', async ({ tripId }) => {
      const trip = await Trip.findById(tripId).populate('driver', 'name phone rating');
      if (!trip) return;

      io.to(`user:${trip.customer.toString()}`).emit('ride:driverAssigned', {
        tripId,
        driver: trip.driver
      });
    });

    // ---------- Trip status changes (arrived / started / completed / cancelled) ----------
    socket.on('trip:statusChanged', async ({ tripId, status }) => {
      const trip = await Trip.findById(tripId);
      if (!trip) return;

      const targetUserId =
        socket.user.role === 'driver' ? trip.customer.toString() : trip.driver?.toString();

      if (targetUserId) {
        io.to(`user:${targetUserId}`).emit('trip:statusUpdated', { tripId, status });
      }
    });

    // ---------- In-trip chat ----------
    socket.on('chat:send', async ({ tripId, message }) => {
      if (!message?.trim()) return;

      const trip = await Trip.findById(tripId);
      if (!trip) return;

      const isParticipant =
        trip.customer.toString() === userId || trip.driver?.toString() === userId;
      if (!isParticipant) return;

      const chatMessage = await ChatMessage.create({
        trip: tripId,
        sender: userId,
        message: message.trim()
      });

      const recipientId =
        trip.customer.toString() === userId ? trip.driver?.toString() : trip.customer.toString();

      const payload = {
        tripId,
        message: chatMessage.message,
        sender: userId,
        createdAt: chatMessage.createdAt
      };

      socket.emit('chat:message', payload); // echo back to sender
      if (recipientId) io.to(`user:${recipientId}`).emit('chat:message', payload);
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);

      // Auto-flip drivers offline when their socket drops so ghost drivers
      // don't keep showing up in nearby-driver searches.
      if (socket.user.role === 'driver') {
        await DriverProfile.findOneAndUpdate({ user: userId }, { isOnline: false });
      }
      console.log(`Socket disconnected: ${socket.user.name}`);
    });
  });
}

module.exports = { initSocket, onlineUsers };
