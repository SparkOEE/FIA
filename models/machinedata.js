const mongoose = require('mongoose');

// Define the schema for machine data
const machineDataSchema = new mongoose.Schema({
  targetValue: {
    type: Number,
    required: true, // target value must be provided
  },
  idealCycleTime: {
    type: Number,
    required: true, // ideal cycle time must be provided
  },
  updatedAt: {
    type: Date,
    default: Date.now, // automatically set the current date on creation
  },
});

// Create the model using the schema
const MachineData = mongoose.model('MachineData', machineDataSchema);

module.exports = MachineData;
