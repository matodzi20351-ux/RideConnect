const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { calculateFare } = require('../utils/fareCalculator');

// All routes below require a logged-in customer
router.use(protect, authorize('customer'));

// @route   POST /api/customer/fare-estimate
// @desc    Get a fare estimate before requesting a ride
// @access  Private (customer)
router.post('/fare-estimate', async (req, res) => {
  try {
    const { pickup, destination } = req.body;

    if (!pickup?.coordinates || !destination?.coordinates) {
      return res.status(400).json({ message: 'pickup and destination coordinates are required' });
    }

    const estimate = await calculateFare(pickup.coordinates, destination.coordinates);
    res.json(estimate);
  } catch (err) {
    res.status(500).json({ message: 'Could not calculate fare estimate', error: err.message });
  }
});

// @route   POST /api/customer/request-ride
// @desc    Create a new trip request. Actual driver-matching happens over
//          Socket.IO (see sockets/socketHandler.js) once this record exists.
// @access  Private (customer)
router.post('/request-ride', async (req, res) => {
  try {
    const { pickup, destination, paymentMethod } = req.body;

    if (!pickup?.coordinates || !destination?.coordinates) {
      return res.status(400).json({ message: 'pickup and destination are required' });
    }

    const { distanceKm, estimatedDurationMin, fareEstimate } = await calculateFare(
      pickup.coordinates,
      destination.coordinates
    );

    const trip = await Trip.create({
      customer: req.user._id,
      pickup,
      destination,
      distanceKm,
      estimatedDurationMin,
      fareEstimate,
      paymentMethod: paymentMethod || 'cash',
      status: 'requested'
    });

    res.status(201).json({ trip, message: 'Ride requested. Searching for nearby drivers...' });
  } catch (err) {
    res.status(500).json({ message: 'Could not request ride', error: err.message });
  }
});

// @route   PATCH /api/customer/trips/:id/cancel
// @desc    Cancel a trip that hasn't started yet
// @access  Private (customer)
router.patch('/trips/:id/cancel', async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, customer: req.user._id });

    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    if (['ongoing', 'completed'].includes(trip.status)) {
      return res.status(400).json({ message: `Cannot cancel a trip that is already ${trip.status}` });
    }

    trip.status = 'cancelled';
    trip.cancelledBy = 'customer';
    trip.cancellationReason = req.body.reason || 'No reason provided';
    await trip.save();

    res.json({ trip, message: 'Trip cancelled' });
  } catch (err) {
    res.status(500).json({ message: 'Could not cancel trip', error: err.message });
  }
});

// @route   GET /api/customer/trips
// @desc    View own trip history
// @access  Private (customer)
router.get('/trips', async (req, res) => {
  try {
    const trips = await Trip.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate('driver', 'name phone rating');

    res.json({ trips });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch trip history', error: err.message });
  }
});

// @route   POST /api/customer/trips/:id/rate-driver
// @desc    Rate the driver after a completed trip
// @access  Private (customer)
router.post('/trips/:id/rate-driver', async (req, res) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, customer: req.user._id });

    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.status !== 'completed') {
      return res.status(400).json({ message: 'Can only rate a completed trip' });
    }
    if (trip.customerRating) {
      return res.status(400).json({ message: 'You have already rated this trip' });
    }

    trip.customerRating = rating;
    await trip.save();

    const driver = await User.findById(trip.driver);
    if (driver) {
      driver.addRating(rating);
      await driver.save();
    }

    res.json({ message: 'Thanks for rating your driver!' });
  } catch (err) {
    res.status(500).json({ message: 'Could not submit rating', error: err.message });
  }
});

module.exports = router;
