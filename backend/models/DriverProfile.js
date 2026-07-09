const mongoose = require('mongoose');

const driverProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required']
    },
    licenseImageUrl: {
      type: String,
      required: [true, "Driver's license image is required"]
    },
    licenseExpiry: {
      type: Date,
      required: true
    },
    vehicle: {
      make: { type: String, required: true },
      model: { type: String, required: true },
      year: { type: Number, required: true },
      color: { type: String, required: true },
      plateNumber: { type: String, required: true },
      vehiclePhotoUrl: { type: String, required: true },
      vehicleType: {
        type: String,
        enum: ['sedan', 'suv', 'hatchback', 'bakkie', 'minibus'],
        default: 'sedan'
      }
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    // GeoJSON point for geospatial "nearby drivers" queries
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    earnings: {
      total: { type: Number, default: 0 },
      pendingPayout: { type: Number, default: 0 }
    },
    totalTrips: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Enables $near / $nearSphere geospatial queries to find nearby online drivers
driverProfileSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('DriverProfile', driverProfileSchema);
