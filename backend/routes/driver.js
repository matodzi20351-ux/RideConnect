const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes below require a logged-in driver
router.use(protect, authorize('driver'));

// Helper to ensure the driver has been approved by an admin before they can act
async function requireApprovedDriver(req, res, next) {
  const profile = await DriverProfile.findOne({ user: req.user._id });

  if (!profile) return res.status(404).json({ message: 'Driver profile not found' });
  if (profile.approvalStatus !== 'approved') {
    return res.status(403).json({
      message: `Your driver account is ${profile.approvalStatus}. You cannot go online yet.`
    });
  }

  req.driverProfile = profile;
  next();
}

// @route   GET /api/driver/profile
// @desc    View own driver profile (license, vehicle, approval status, earnings)
// @access  Private (driver)
router.get('/profile', async (req, res) => {
  const profile = await DriverProfile.findOne({ user: req.user._id });
  res.json({ profile });
});

// @route   PATCH /api/driver/status
// @desc    Go online or offline
// @access  Private (driver, approved only)
router.patch('/status', requireApprovedDriver, async (req, res) => {
  try {
    const { isOnline, coordinates } = req.body;

    req.driverProfile.isOnline = Boolean(isOnline);
    if (coordinates) {
      req.driverProfile.currentLocation = { type: 'Point', coordinates };
    }
    await req.driverProfile.save();

    res.json({
      message: `You are now ${req.driverProfile.isOnline ? 'online' : 'offline'}`,
      profile: req.driverProfile
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not update status', error: err.message });
  }
});

// @route   PATCH /api/driver/location
// @desc    Update live GPS location (called frequently while online/on a trip;
//          for real-time tracking prefer the Socket.IO 'driver:locationUpdate' event —
//          this REST endpoint exists as a fallback / for initial sync)
// @access  Private (driver)
router.patch('/location', async (req, res) => {
  try {
    const { coordinates } = req.body;
    if (!coordinates) return res.status(400).json({ message: 'coordinates are required' });

    const profile = await DriverProfile.findOneAndUpdate(
      { user: req.user._id },
      { currentLocation: { type: 'Point', coordinates } },
      { new: true }
    );

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ message: 'Could not update location', error: err.message });
  }
});

// @route   GET /api/driver/nearby-requests
// @desc    Find pending trip requests near the driver's current location
// @access  Private (driver, approved only)
router.get('/nearby-requests', requireApprovedDriver, async (req, res) => {
  try {
    const [lng, lat] = req.driverProfile.currentLocation.coordinates;
    const maxDistanceMeters = Number(req.query.radiusKm || 5) * 1000;

    const trips = await Trip.find({
      status: 'requested',
      'pickup.coordinates': {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxDistanceMeters
        }
      }
    }).populate('customer', 'name phone rating');

    res.json({ trips });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch nearby requests', error: err.message });
  }
});

// @route   PATCH /api/driver/trips/:id/accept
// @desc    Accept a pending ride request
// @access  Private (driver, approved only)
router.patch('/trips/:id/accept', requireApprovedDriver, async (req, res) => {
  try {
    // Atomic find-and-update prevents two drivers from accepting the same trip
    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, status: 'requested' },
      { status: 'accepted', driver: req.user._id, acceptedAt: new Date() },
      { new: true }
    );

    if (!trip) {
      return res.status(409).json({ message: 'This trip is no longer available' });
    }

    res.json({ trip, message: 'Trip accepted' });
  } catch (err) {
    res.status(500).json({ message: 'Could not accept trip', error: err.message });
  }
});

// @route   PATCH /api/driver/trips/:id/decline
// @desc    Decline a trip request (no-op on the trip itself — it just stays
//          'requested' so it can be offered to the next nearby driver)
// @access  Private (driver)
router.patch('/trips/:id/decline', (req, res) => {
  res.json({ message: 'Trip declined' });
});

// @route   PATCH /api/driver/trips/:id/arrived
// @desc    Mark that the driver has arrived at the pickup point
// @access  Private (driver)
router.patch('/trips/:id/arrived', async (req, res) => {
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, driver: req.user._id, status: 'accepted' },
    { status: 'arrived', arrivedAt: new Date() },
    { new: true }
  );
  if (!trip) return res.status(404).json({ message: 'Trip not found or not in the right state' });
  res.json({ trip });
});

// @route   PATCH /api/driver/trips/:id/start
// @desc    Start the trip (passenger picked up)
// @access  Private (driver)
router.patch('/trips/:id/start', async (req, res) => {
  const trip = await Trip.findOneAndUpdate(
    { _id: req.params.id, driver: req.user._id, status: 'arrived' },
    { status: 'ongoing', startedAt: new Date() },
    { new: true }
  );
  if (!trip) return res.status(404).json({ message: 'Trip not found or not in the right state' });
  res.json({ trip });
});

// @route   PATCH /api/driver/trips/:id/complete
// @desc    Complete the trip and credit driver earnings
// @access  Private (driver)
router.patch('/trips/:id/complete', async (req, res) => {
  try {
    const { finalFare } = req.body;

    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id, status: 'ongoing' });
    if (!trip) return res.status(404).json({ message: 'Trip not found or not in the right state' });

    trip.status = 'completed';
    trip.completedAt = new Date();
    trip.finalFare = finalFare || trip.fareEstimate;
    trip.paymentStatus = trip.paymentMethod === 'cash' ? 'paid' : trip.paymentStatus;
    await trip.save();

    await DriverProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        $inc: {
          'earnings.total': trip.finalFare,
          'earnings.pendingPayout': trip.finalFare,
          totalTrips: 1
        }
      }
    );

    res.json({ trip, message: 'Trip completed' });
  } catch (err) {
    res.status(500).json({ message: 'Could not complete trip', error: err.message });
  }
});

// @route   POST /api/driver/trips/:id/rate-customer
// @desc    Rate the customer after a completed trip
// @access  Private (driver)
router.post('/trips/:id/rate-customer', async (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id, status: 'completed' });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.driverRating) return res.status(400).json({ message: 'Already rated' });

    trip.driverRating = rating;
    await trip.save();

    const customer = await User.findById(trip.customer);
    if (customer) {
      customer.addRating(rating);
      await customer.save();
    }

    res.json({ message: 'Rating submitted' });
  } catch (err) {
    res.status(500).json({ message: 'Could not submit rating', error: err.message });
  }
});

// @route   GET /api/driver/earnings
// @desc    View earnings summary
// @access  Private (driver)
router.get('/earnings', async (req, res) => {
  const profile = await DriverProfile.findOne({ user: req.user._id });
  res.json({ earnings: profile?.earnings, totalTrips: profile?.totalTrips });
});

module.exports = router;
