const mongoose = require('mongoose');

// Singleton-style document — only one active pricing config at a time.
const pricingConfigSchema = new mongoose.Schema(
  {
    baseFare: { type: Number, required: true, default: 15 },
    costPerKm: { type: Number, required: true, default: 6 },
    costPerMin: { type: Number, required: true, default: 1.5 },
    minimumFare: { type: Number, required: true, default: 25 },
    cancellationFee: { type: Number, required: true, default: 10 },
    currency: { type: String, default: 'ZAR' },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingConfig', pricingConfigSchema);
