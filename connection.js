const mongoose = require("mongoose");


const connection = async () => {   
    try {
      await mongoose.connect('mongodb+srv://demo:demo@cluster0.8xdzq.mongodb.net/fia');
      console.log('Connected to MongoDB');
    } catch (e) {
      console.log('Connection error:', e);
    }
  };

connection();
  