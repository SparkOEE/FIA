const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const moment = require('moment-timezone');  // You can use moment-timezone to handle timezone issues
const ExcelJS = require('exceljs');
const PartData = require('./models/partdata');
const MachineData = require('./models/machinedata');
const DailyMachineData = require('./models/dailymachinedata');
const OeeMeasurement = require('./models/oeemeasurements');

require('./connection');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));


const port = process.env.PORT || 3000;

// POST API to get the most recent data for a given partname and partnumber
app.post('/spark/data/last', async (req, res) => {
    try {
      const { partname, partnumber } = req.body;
  
      // Basic validation
      if (!partname || !partnumber) {
        return res.status(400).json({ error: 'partname and partnumber are required' });
      }
  
      // Query the database to find the most recent entry for the given partname and partnumber
      const lastEntry = await PartData.findOne({ partname, partnumber })
        .sort({ createdAt: -1 }) // Sort by createdAt in descending order (most recent first)
        .exec();
  
      // If no entry found, return a 404 error
      if (!lastEntry) {
        return res.status(404).json({ error: 'No entry found for the given partname and partnumber' });
      }
  
      // Return the most recent entry
      res.status(200).json(lastEntry);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  

// POST endpoint to store or update part data
app.post('/spark/data', async (req, res) => {
  try {
    const { partnumber, count } = req.body;
    console.log(`the partnumber and count is ${partnumber} && ${count}`);

    // Basic validation
    if (!partnumber || count == null) { // check for count being null or undefined
      return res.status(400).json({ error: 'partnumber and count are required' });
    }

    // Define part names based on part numbers
    const partNames = {
      '9253020232': 'Big Cylinder',
      '9253010242': 'Small Cylinder'
    };

    const partname = partNames[partnumber];

    if (!partname) {
      return res.status(400).json({ error: 'Invalid part number provided' });
    }

    // Get current date and time to determine the shift
    const now = new Date();
    const localNow = moment.tz(now, 'Asia/Kolkata');  // Convert to Indian Standard Time (IST)

    const startOfDay = localNow.clone().set({ hour: 8, minute: 30, second: 0, millisecond: 0 });
    const endOfDay = localNow.clone().set({ hour: 19, minute: 0, second: 0, millisecond: 0 });

    // Determine the shift
    let shift = localNow.isBetween(startOfDay, endOfDay, null, '[]') ? 'shift1' : 'shift2';

    const todayStart = localNow.clone().startOf('day');

    // Check for existing part data
    let existingPart = await PartData.findOne({
      partnumber,
      createdAt: { $gte: todayStart.toDate() },
      shift
    });

    if (existingPart) {
      existingPart.count = count;
      existingPart.shift = shift; // Ensure it reflects the correct shift
      await existingPart.save();
      return res.status(200).json({ message: 'Record updated successfully' });
    }

    // If not existing, create a new record
    const partData = new PartData({
      partname, 
      partnumber, 
      count, 
      shift, 
    });

    await partData.save();
    res.status(200).json({ message: 'Data added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




// PATCH API to update the target value
app.patch('/spark/machine/target', async (req, res) => {
    try {
      const { targetValue } = req.body;
  
      // Basic validation
      if (targetValue == null) {
        return res.status(400).json({ error: 'targetValue is required' });
      }
  
      // Find and update the target value in the machine data
      const machineData = await MachineData.findOneAndUpdate(
        {}, // No filter needed, we only have one entry
        { targetValue, updatedAt: Date.now() }, // Set the new target value and update the timestamp
        { new: true, upsert: true } // upsert will create the document if it does not exist
      );
  
      // Return the updated machine data
      res.status(200).json(machineData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  // PATCH API to update the ideal cycle time
  app.patch('/spark/machine/cycletime', async (req, res) => {
    try {
      const { idealCycleTime } = req.body;
  
      // Basic validation to ensure idealCycleTime is provided and is a number
      if (idealCycleTime == null || isNaN(idealCycleTime)) {
        return res.status(400).json({ error: 'idealCycleTime is required and must be a valid number' });
      }
  
      // Find and update the ideal cycle time in the machine data
      const machineData = await MachineData.findOneAndUpdate(
        {}, // No filter needed, we only have one entry
        { idealCycleTime, updatedAt: Date.now() }, // Set the new ideal cycle time and update the timestamp
        { new: true, upsert: true } // upsert will create the document if it does not exist
      );
  
      // Return the updated machine data
      res.status(200).json(machineData);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
// POST API to calculate and store OEE measurements
app.post('/spark/machine/oee', async (req, res) => {
  try {
    console.log('Received request body:', req.body);  // Debugging line to see incoming data

    // Destructure the rejections, stopTimes, date, and shift from req.body
    const { rejections, stopTimes, date, shift } = req.body;

    // Validate input
    if (!rejections || !Array.isArray(rejections) || !stopTimes || !date || !shift) {
      return res.status(400).json({ error: 'Rejections, stopTimes, date, and shift are required.' });
    }

    // Step 1: Get the total count of parts manufactured on the given date and shift
    const partData = await PartData.aggregate([{
        $match: {
          createdAt: {
            $gte: new Date(date),
            $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
          },
          shift: shift, // Include shift condition
        },
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: '$count' },
        },
      },
    ]);

    if (!partData.length) {
      return res.status(404).json({ error: 'No part data found for the given date and shift.' });
    }

    const totalCount = partData[0].totalCount;
    let totalRejectedCount = 0;

    // Step 2: Process rejections and update rejected count in PartData
    for (const rejection of rejections) {
      const { partNumber, rejectedCount, faultType } = rejection;

      // Validate each rejection object
      if (!partNumber || !rejectedCount || !faultType) {
        return res.status(400).json({ error: 'Each rejection must have partNumber, rejectedCount, and faultType.' });
      }

      // Find the PartData document for the rejected part number and shift
      const part = await PartData.findOne({ partnumber: partNumber, shift: shift });

      if (part) {
        // Update the rejected count for that part
        part.rejectedcount = (part.rejectedcount || 0) + rejectedCount;
        await part.save();
        totalRejectedCount += rejectedCount;
      } else {
        console.log(`Part not found for shift ${shift}: ${partNumber}`);
      }
    }

    const goodCount = totalCount - totalRejectedCount;

    // Step 3: Fetch the idealCycleTime from the MachineData model
    const machineData = await MachineData.findOne();
    const idealCycleTime = machineData.idealCycleTime; // Ideal cycle time in seconds

    // Step 4: Calculate the Quality, Availability, Performance, and OEE

    // Quality = (Good Count / Total Count) * 100
    const quality = ((goodCount / totalCount) * 100).toFixed(2);

    // Planned Production Time = 10 hours (600 minutes)
    const plannedProductionTime = 600;

    // Run Time = Planned Production Time - Sum of Stop Times in minutes
    const totalStopTimeInMinutes = stopTimes.reduce((acc, stopTime) => {
      const fromTime = new Date(stopTime.fromTime);
      const toTime = new Date(stopTime.toTime);
      const stopTimeInMinutes = (toTime - fromTime) / (1000 * 60); // Convert to minutes
      return acc + stopTimeInMinutes;
    }, 0);

    const runTime = plannedProductionTime - totalStopTimeInMinutes;

    // Availability = Run Time / Planned Production Time * 100
    const availability = ((runTime / plannedProductionTime) * 100).toFixed(2);

    // Performance = (Ideal Cycle Time * Total Count) / Run Time (in minutes)
    const performance = (((idealCycleTime * totalCount) / (runTime * 60)) * 100).toFixed(2); // Ideal Cycle Time in seconds, hence we divide by 60

    // OEE = Availability * Performance * Quality
    const oee = ((availability / 100) * (performance / 100) * (quality / 100) * 100).toFixed(2);

    // Step 5: Save or Update the OEE Measurement for the given day and shift
    const oeeMeasurement = await OeeMeasurement.findOneAndUpdate(
      { date, shift },
      {
        availability: Number(availability),  // Convert back to number
        performance: Number(performance),    // Convert back to number
        quality: Number(quality),            // Convert back to number
        oee: Number(oee),                    // Convert back to number
        rejectedCount: totalRejectedCount,
        stopTimes: stopTimes.map((stopTime) => ({
          ...stopTime, // Spread the stopTime data
          reason: stopTime.reason, // Ensure reason is included
        })),
        updatedAt: Date.now(),
      },
      { new: true, upsert: true } // upsert will create a new document if it doesn't exist
    );

    // Return the updated or newly created OEE measurement
    res.status(200).json(oeeMeasurement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Node.js with Express
app.get('/api/parts/latest', async (req, res) => {
  try {
      // Assuming 'PartData' is your model that contains parts data
      const latestPart = await PartData.findOne().sort({ createdAt: -1 }); // Ensure there is an index on 'createdAt'
      console.log(latestPart);
      
      if (!latestPart) {
          return res.status(404).json({ message: 'No part data found.' });
      }

      res.status(200).json({
          partName: latestPart.partname, // Ensure you have 'partName' in your schema
          partNumber: latestPart.partnumber // Ensure you have 'partNumber' in your schema
      });
  } catch (error) {
      console.error('Failed to fetch latest part data:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});


// In your Express.js routes file

app.get('/api/parts/comparison', async (req, res) => {
  try {
    // Fetch the latest entries for part comparison
    const partsData = await PartData  .find({}).sort({ updatedAt: -1 }).limit(2);
    res.status(200).json(partsData);
  } catch (error) {
    console.error('Failed to fetch parts data', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  
// // Cron job to transfer OEE data to DailyMachineData at midnight
// cron.schedule('0 0 * * *', async () => {
//     console.log('Running cron job at midnight to transfer OEE data to DailyMachineData');
  
//     try {
//       // Get the OEE measurements for the day (ensure the 'date' is set to today)
//       const oeeData = await OeeMeasurement.findOne({ date: new Date().toISOString().split('T')[0] });
  
//       if (oeeData) {
//         // Create a new DailyMachineData entry
//         const dailyMachineData = new DailyMachineData({
//           availability: oeeData.availability,
//           performance: oeeData.performance,
//           quality: oeeData.quality,
//           oee: oeeData.oee,
//           rejectedCount: oeeData.rejectedCount,
//           stopTimes: oeeData.stopTimes,
//           date: new Date(),
//         });
  
//         // Save the dailyMachineData entry
//         await dailyMachineData.save();
  
//         console.log('Data successfully transferred to DailyMachineData for', oeeData.date);
//       } else {
//         console.log('No OEE data found for today.');
//       }
//     } catch (error) {
//       console.error('Error transferring OEE data to DailyMachineData:', error);
//     }
//   });


app.get('/api/machine/counts', async (req, res) => {
  try {
    // Example fetching latest counts from your database models
    
    const latestPart = await PartData.findOne().sort({updatedAt: -1});
    const machineSettings = await MachineData.findOne(); // Assuming this holds the target/planned data

    if (!latestPart || !machineSettings) {
      return res.status(404).json({message: 'Data not found.'});
    }

    res.status(200).json({
      actual: latestPart.count,
      planned: machineSettings.targetValue // Example field, adjust according to your actual schema
    });
  } catch (error) {
    console.error('Failed to fetch counts:', error);
    res.status(500).json({message: 'Internal server error'});
  }
});


// GET route to fetch the last 10 OEE measurements
// GET route to fetch the last 10 OEE measurements
app.get('/api/oee/last-ten', async (req, res) => {
  try {
    const lastTenOee = await OeeMeasurement.find()
      .sort({ createdAt: -1 })
      .limit(10);

    if (lastTenOee.length === 0) {
      return res.status(404).json({ message: 'No OEE data found.' });
    }

    res.status(200).json(lastTenOee.map(oee => ({
      date: oee.date.toISOString().split('T')[0], // Formats the date to YYYY-MM-DD
      oee: oee.oee
    })));
  } catch (error) {
    console.error('Error fetching last 10 OEE measurements:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  app.get('/api/data', async (req, res) => {
    try {
      // Extract the date parameter from the request (format: YYYY-MM-DD)
      //const { date } = req.params;
  
      // Query the OeeMeasurement model for data for the specified date
      const oeeData = await OeeMeasurement.findOne().sort({ createdAt: -1 });
  
      if (!oeeData) {
        return res.status(404).json({ message: 'No OEE data found for this date.' });
      }
  
      // Send the OEE data as the response
      return res.status(200).json(oeeData);
    } catch (error) {
      console.error('Error fetching OEE data:', error);
      return res.status(500).json({ message: 'Internal server error.' });
    }
  });





// Endpoint to generate and download Excel report
app.post('/spark/oee/generate-report', async (req, res) => {
  try {
    // Destructure the input parameters
    const { fromDate, toDate, metrics } = req.body;

    // Validate the input
    if (!fromDate || !toDate || !metrics || metrics.length === 0) {
      return res.status(400).json({ error: 'fromDate, toDate, and metrics are required.' });
    }

    // Convert the dates to proper Date objects
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999); // Set to the end of the day for the 'to' date

    // Fetch the OEE data from the database based on the selected date range
    const oeeData = await OeeMeasurement.find({
      date: { $gte: from, $lte: to }
    });

    if (!oeeData.length) {
      return res.status(404).json({ error: 'No data found for the selected date range.' });
    }

    // Initialize ExcelJS workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('OEE Report');

    // Set the header row based on selected metrics
    const headers = ['Date', 'Shift', 'Rejected Count', ...metrics];
    worksheet.addRow(headers);

    // Loop through the OEE data and add rows for each record
    oeeData.forEach(record => {
      const row = [
        record.date.toISOString().split('T')[0], // Convert date to YYYY-MM-DD format
        record.shift,
        record.rejectedCount,
        ...metrics.map(metric => record[metric]) // Add the selected metrics
      ];
      worksheet.addRow(row);
    });

    // Set the response header for downloading the Excel file
    res.setHeader('Content-Disposition', 'attachment; filename=OEE_Report.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Write the Excel file to the response
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
  


app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
})  
