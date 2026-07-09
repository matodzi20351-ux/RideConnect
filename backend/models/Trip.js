const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    pickup: {
      type: locationSchema,
      required: true
    },
    destination: {
      type: locationSchema,
      required: true
    },
    distanceKm: {
      type: Number,
      required: true
    },
    estimatedDurationMin: {
      type: Number,
      required: true
    },
    fareEstimate: {
      type: Number,
      required: true
    },
    finalFare: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: [
        'requested',   // customer requested, searching for driver
        'accepted',    // driver accepted, en route to pickup
        'arrived',     // driver arrived at pickup point
        'ongoing',     // trip in progress
        'completed',   // trip finished
        'cancelled'    // cancelled by customer, driver, or admin
      ],
      default: 'requested'
    },
    cancelledBy: {
      type: String,
      enum: ['customer', 'driver', 'admin', null],
      default: null
    },
    cancellationReason: {
      type: String,
      default: ''
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'wallet'],
      default: 'cash'
    },
    customerRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    driverRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    requestedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    arrivedAt: Date,
    startedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

tripSchema.index({ 'pickup.coordinates': '2dsphere' });
tripSchema.index({ status: 1 });

module.exports = mongoose.model('Trip', tripSchema);
