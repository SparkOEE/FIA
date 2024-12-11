const mongoose = require('mongoose');

const getISTTime = () => {
  let date = new Date();
  let ISTOffset = 330; // IST offset in minutes
  let ISTTime = new Date(date.getTime() + ISTOffset * 60 * 1000);
  return ISTTime; // Returns the time adjusted to IST
};

// Define the schema for the part data
const partDataSchema = new mongoose.Schema({
  partname: {
    type: String,
    required: true,
  },
  partnumber: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    required: true,
  },
  rejectedcount: {
    type: Number,
    required: false,
  },
  shift: {
    type: String,
    enum: ['shift1', 'shift2'], // "shift1" for 8:30 AM - 7 PM, "shift2" for 8:30 PM - 7 AM
    required: true,
  },
  // Auto-generated timestamp in IST when the data is saved
  createdAt: {
    type: Date,  // Store the time as a Date object
    default: getISTTime, // Set default to the current IST time
    required: true,
  },
  updatedAt: {
    type: Date,  // Store the time as a Date object
    default: getISTTime, // Set default to the current IST time
    required: true,
  }
});

// Middleware to automatically set updatedAt before each document save
partDataSchema.pre('save', function(next) {
  // Only update `updatedAt` when the document is modified (not on initial save)
  if (this.isModified()) {
    this.updatedAt = getISTTime(); // Set updatedAt to current IST time
  }
  next();
});

// Create the model using the schema
const PartData = mongoose.model('PartData', partDataSchema);

module.exports = PartData;
