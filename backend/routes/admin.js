const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const Trip = require('../models/Trip');
const PricingConfig = require('../models/PricingConfig');
const Complaint = require('../models/Complaint');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes below require a logged-in admin
router.use(protect, authorize('admin'));

// ---------- Drivers ----------

// @route   GET /api/admin/drivers
// @desc    View all drivers, optionally filtered by approval status
router.get('/drivers', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.approvalStatus = req.query.status;

  const drivers = await DriverProfile.find(filter).populate('user', 'name email phone isSuspended rating');
  res.json({ drivers });
});

// @route   PATCH /api/admin/drivers/:id/approve
router.patch('/drivers/:id/approve', async (req, res) => {
  const profile = await DriverProfile.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'approved', rejectionReason: '' },
    { new: true }
  );
  if (!profile) return res.status(404).json({ message: 'Driver profile not found' });
  res.json({ profile, message: 'Driver approved' });
});

// @route   PATCH /api/admin/drivers/:id/reject
router.patch('/drivers/:id/reject', async (req, res) => {
  const profile = await DriverProfile.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'rejected', rejectionReason: req.body.reason || 'Not specified' },
    { new: true }
  );
  if (!profile) return res.status(404).json({ message: 'Driver profile not found' });
  res.json({ profile, message: 'Driver rejected' });
});

// ---------- Users ----------

// @route   GET /api/admin/customers
router.get('/customers', async (req, res) => {
  const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
  res.json({ customers });
});

// @route   PATCH /api/admin/users/:id/suspend
router.patch('/users/:id/suspend', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isSuspended: true }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user, message: 'User suspended' });
});

// @route   PATCH /api/admin/users/:id/unsuspend
router.patch('/users/:id/unsuspend', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isSuspended: false }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user, message: 'User unsuspended' });
});

// ---------- Trips ----------

// @route   GET /api/admin/trips/live
// @desc    Monitor all trips currently in progress
router.get('/trips/live', async (req, res) => {
  const trips = await Trip.find({ status: { $in: ['accepted', 'arrived', 'ongoing'] } })
    .populate('customer', 'name phone')
    .populate('driver', 'name phone');
  res.json({ trips });
});

// @route   GET /api/admin/trips
// @desc    All trips, with basic filtering, for reporting
router.get('/trips', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const trips = await Trip.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 200)
    .populate('customer', 'name')
    .populate('driver', 'name');

  res.json({ trips });
});

// @route   GET /api/admin/reports/summary
// @desc    High-level stats for the admin dashboard
router.get('/reports/summary', async (req, res) => {
  const [totalCustomers, totalDrivers, approvedDrivers, totalTrips, completedTrips, revenueAgg] =
    await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'driver' }),
      DriverProfile.countDocuments({ approvalStatus: 'approved' }),
      Trip.countDocuments(),
      Trip.countDocuments({ status: 'completed' }),
      Trip.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$finalFare' } } }
      ])
    ]);

  res.json({
    totalCustomers,
    totalDrivers,
    approvedDrivers,
    totalTrips,
    completedTrips,
    totalRevenue: revenueAgg[0]?.totalRevenue || 0
  });
});

// ---------- Pricing ----------

// @route   GET /api/admin/pricing
router.get('/pricing', async (req, res) => {
  let config = await PricingConfig.findOne().sort({ createdAt: -1 });
  if (!config) config = await PricingConfig.create({});
  res.json({ config });
});

// @route   PUT /api/admin/pricing
// @desc    Update pricing — creates a new config record so history is preserved
router.put('/pricing', async (req, res) => {
  const { baseFare, costPerKm, costPerMin, minimumFare, cancellationFee } = req.body;

  const config = await PricingConfig.create({
    baseFare,
    costPerKm,
    costPerMin,
    minimumFare,
    cancellationFee,
    updatedBy: req.user._id
  });

  res.status(201).json({ config, message: 'Pricing updated' });
});

// ---------- Complaints ----------

// @route   GET /api/admin/complaints
router.get('/complaints', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const complaints = await Complaint.find(filter)
    .sort({ createdAt: -1 })
    .populate('filedBy', 'name role')
    .populate('against', 'name role')
    .populate('trip');

  res.json({ complaints });
});

// @route   PATCH /api/admin/complaints/:id
router.patch('/complaints/:id', async (req, res) => {
  const { status, adminNotes } = req.body;

  const complaint = await Complaint.findByIdAndUpdate(
    req.params.id,
    { status, adminNotes, resolvedBy: req.user._id },
    { new: true }
  );

  if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
  res.json({ complaint });
});

module.exports = router;
