const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const ChatMessage = require('../models/ChatMessage');
const Complaint = require('../models/Complaint');
const { protect } = require('../middleware/auth');

// All routes below just require any logged-in user (customer, driver, or admin)
router.use(protect);

// Helper: confirm the requester is actually part of this trip (or an admin)
async function getAuthorizedTrip(req, res) {
  const trip = await Trip.findById(req.params.id);
  if (!trip) {
    res.status(404).json({ message: 'Trip not found' });
    return null;
  }

  const isParticipant =
    trip.customer.toString() === req.user._id.toString() ||
    (trip.driver && trip.driver.toString() === req.user._id.toString());

  if (!isParticipant && req.user.role !== 'admin') {
    res.status(403).json({ message: 'You are not part of this trip' });
    return null;
  }

  return trip;
}

// @route   GET /api/trips/:id
// @desc    Get a single trip's details (used for live tracking screen)
// @access  Private (trip participants + admin)
router.get('/:id', async (req, res) => {
  const trip = await getAuthorizedTrip(req, res);
  if (!trip) return;

  await trip.populate('customer', 'name phone rating');
  await trip.populate('driver', 'name phone rating');

  res.json({ trip });
});

// @route   GET /api/trips/:id/messages
// @desc    Fetch chat history for a trip
// @access  Private (trip participants + admin)
router.get('/:id/messages', async (req, res) => {
  const trip = await getAuthorizedTrip(req, res);
  if (!trip) return;

  const messages = await ChatMessage.find({ trip: trip._id }).sort({ createdAt: 1 });
  res.json({ messages });
});

// @route   POST /api/trips/:id/messages
// @desc    Send a chat message (also broadcast live via Socket.IO — see
//          sockets/socketHandler.js 'chat:send' event, this is the REST fallback)
// @access  Private (trip participants)
router.post('/:id/messages', async (req, res) => {
  const trip = await getAuthorizedTrip(req, res);
  if (!trip) return;

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ message: 'Message text is required' });

  const chatMessage = await ChatMessage.create({
    trip: trip._id,
    sender: req.user._id,
    message: message.trim()
  });

  res.status(201).json({ chatMessage });
});

// @route   POST /api/trips/:id/complaint
// @desc    File a complaint about this trip
// @access  Private (trip participants)
router.post('/:id/complaint', async (req, res) => {
  const trip = await getAuthorizedTrip(req, res);
  if (!trip) return;

  const { category, description } = req.body;
  if (!description?.trim()) {
    return res.status(400).json({ message: 'Please describe the issue' });
  }

  const against =
    trip.customer.toString() === req.user._id.toString() ? trip.driver : trip.customer;

  const complaint = await Complaint.create({
    filedBy: req.user._id,
    against,
    trip: trip._id,
    category: category || 'other',
    description: description.trim()
  });

  res.status(201).json({ complaint, message: 'Complaint filed. Our team will review it.' });
});

module.exports = router;
