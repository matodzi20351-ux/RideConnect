const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    filedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    against: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null
    },
    category: {
      type: String,
      enum: ['safety', 'payment', 'behaviour', 'vehicle', 'app_bug', 'other'],
      default: 'other'
    },
    description: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'dismissed'],
      default: 'open'
    },
    adminNotes: {
      type: String,
      default: ''
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
