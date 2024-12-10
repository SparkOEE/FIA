const mongoose = require('mongoose');

// Define the stopTime schema
const stopTimeSchema = new mongoose.Schema({
  fromTime: {
    type: Date,
    required: true,
  },
  toTime: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
});

// Define the OEE Measurement schema
const oeeMeasurementSchema = new mongoose.Schema({
  availability: {
    type: Number, // in percentage
    required: true,
  },
  performance: {
    type: Number, // in percentage
    required: true,
  },
  quality: {
    type: Number, // in percentage
    required: true,
  },
  oee: {
    type: Number, // in percentage
    required: true,
  },
  rejectedCount: {
    type: Number,
    required: true,
  },
  stopTimes: [stopTimeSchema], // Array of stop times (downtime events)
  date: {
    type: Date,
    required: true,
  },
  shift: {
    type: String,
    required: true,
    enum: ['shift1', 'shift2'],
  },
  createdAt: {
    type: Date,
    default: () => {
      let date = new Date();
      let ISTOffset = 330; // IST offset in minutes
      let ISTTime = new Date(date.getTime() + ISTOffset * 60 * 1000);
      return ISTTime;  // Save the timestamp as a Date object
    },
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create the model using the schema
const OeeMeasurement = mongoose.model('OeeMeasurement', oeeMeasurementSchema);

module.exports = OeeMeasurement;
