const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new customer or driver
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, driverDetails } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or phone number already registered' });
    }

    const userRole = role === 'driver' ? 'driver' : 'customer';

    const user = await User.create({ name, email, phone, password, role: userRole });

    // If registering as a driver, create the linked driver profile
    if (userRole === 'driver') {
      if (!driverDetails) {
        return res.status(400).json({
          message: 'driverDetails (license and vehicle info) is required for driver registration'
        });
      }

      const { licenseNumber, licenseImageUrl, licenseExpiry, vehicle } = driverDetails;

      if (!licenseNumber || !licenseImageUrl || !licenseExpiry || !vehicle) {
        // Roll back the user if driver details are incomplete
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ message: 'Incomplete driver details' });
      }

      await DriverProfile.create({
        user: user._id,
        licenseNumber,
        licenseImageUrl,
        licenseExpiry,
        vehicle
      });
    }

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      message:
        userRole === 'driver'
          ? 'Registered successfully. Your account is pending admin approval.'
          : 'Registered successfully.'
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login for customer, driver, or admin
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Your account has been suspended' });
    }

    let driverProfile = null;
    if (user.role === 'driver') {
      driverProfile = await DriverProfile.findOne({ user: user._id });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        rating: user.rating
      },
      driverProfile: driverProfile
        ? { approvalStatus: driverProfile.approvalStatus, isOnline: driverProfile.isOnline }
        : null
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged-in user's profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
