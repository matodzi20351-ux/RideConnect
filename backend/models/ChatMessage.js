const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ trip: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
