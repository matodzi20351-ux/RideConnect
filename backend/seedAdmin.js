// One-off script to create the first admin account.
// Run with: node seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
    return process.exit(0);
  }

  const admin = await User.create({
    name: 'Super Admin',
    email: 'admin@rideconnect.local',
    phone: '0000000000',
    password: 'ChangeMe123!', // change this immediately after first login
    role: 'admin'
  });

  console.log('Admin created:');
  console.log(`  email: ${admin.email}`);
  console.log('  password: ChangeMe123!  <-- change this immediately');
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
