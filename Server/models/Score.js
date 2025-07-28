const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  playerName: {
    type: String,
    required: true,
    enum: ['Jule', 'Finn']
  },
  score: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Score', scoreSchema); 