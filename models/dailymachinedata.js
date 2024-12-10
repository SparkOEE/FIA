const mongoose = require('mongoose');

// Define the schema for daily machine data
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

const dailyMachineDataSchema = new mongoose.Schema({
  targetValue: {
    type: Number,
    required: true, // The target value for the day
  },
  actualCount: {
    type: Number,
    required: true, // The actual count of products produced
  },
  availability: {
    type: Number, // This could be a percentage, for example
    required: true,
  },
  performance: {
    type: Number, // Performance metric (percentage)
    required: true,
  },
  quality: {
    type: Number, // Quality metric (percentage)
    required: true,
  },
  oee: {
    type: Number, // OEE = Availability * Performance * Quality
    required: true,
  },
  stopTime: [stopTimeSchema], // Array of stop times during the day
  createdAt: {
    type: Date,
    default: Date.now, // Auto set to current date and time
  },
  date: {
    type: Date,
    required: true, // To store the specific date for which the data is entered
    unique: true, // Ensure there's only one record per day
  },
});

// Create the model using the schema
const DailyMachineData = mongoose.model('DailyMachineData', dailyMachineDataSchema);

module.exports = DailyMachineData;
