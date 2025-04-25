const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// File paths for storing data
const attendancePath = path.join(__dirname, 'data', 'attendance.json');
const membersPath = path.join(__dirname, 'data', 'members.json');
const donationPath = path.join(__dirname, 'data', 'donations.json');
const expensesPath = path.join(__dirname, 'data', 'expenses.json');

// Helper functions
const readJSON = (filePath, defaultValue) => {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Routes

// Get member details
app.get('/member-full-details', (req, res) => {
  const members = readJSON(membersPath, []);
  res.json(members);
});

// Get attendance data
app.get('/attendance', (req, res) => {
  const attendance = readJSON(attendancePath, [{}]);
  res.json(attendance);
});

// Helper function to convert month name to month number
const monthNameToNumber = (monthName) => {
  const monthMap = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
  };

  return monthMap[monthName] || null;  // Return null if invalid month name
};

// Helper function to convert month number to month name
const monthNumberToName = (monthNumber) => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", 
    "September", "October", "November", "December"
  ];
  return monthNames[monthNumber - 1] || null;
};

// Update attendance data with month names instead of numbers
// Update attendance data without saving absent roll numbers
app.post('/update-attendance', (req, res) => {
  const { year, month, day, attendance } = req.body;

  if (!year || !month || !day || !Array.isArray(attendance)) {
    return res.status(400).json({ error: 'Missing or invalid data' });
  }

  // Convert month name to number
  const monthNumber = monthNameToNumber(month);
  if (!monthNumber) {
    return res.status(400).json({ error: 'Invalid month name' });
  }

  // Read the current attendance data
  let data = readJSON(attendancePath, [{}]);

  if (typeof data[0] !== 'object' || Array.isArray(data[0])) {
    data[0] = {};
  }

  // Initialize the year, month (as month name), and day if they don't exist
  if (!data[0][year]) data[0][year] = {};
  const monthName = monthNumberToName(monthNumber);  // Get the month name
  if (!data[0][year][monthName]) data[0][year][monthName] = {};
  if (!data[0][year][monthName][day]) data[0][year][monthName][day] = {};

  // Mark attendance for roll numbers in the "attendance" array
  attendance.forEach(rollNo => {
    data[0][year][monthName][day][rollNo] = 'present';  // Mark the rollNo as present
  });

  // Write the updated attendance data
  writeJSON(attendancePath, data);

  res.json({ success: true, message: 'Attendance updated successfully' });
});


// Get donations data
app.get('/donations', (req, res) => {
  const donations = readJSON(donationPath, [{}]);
  res.json(donations);
});

// Get all expense details
app.get('/expenses', (req, res) => {
  const expenses = readJSON(expensesPath, [{}]);
  res.json(expenses);
});

// Update donations data
app.post('/update-donations', (req, res) => {
  const { year, month, rollNo, amount } = req.body;

  if (!year || !month || !rollNo || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid data' });
  }

  let data = readJSON(donationPath, {});

  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};

  if (!data[year][month][rollNo]) {
    data[year][month][rollNo] = 0;
  }

  data[year][month][rollNo] += amount;

  writeJSON(donationPath, data);

  res.json({ success: true, message: 'Donation updated successfully' });
});

// Add expense data
// Add expense data
app.post('/add-expense', (req, res) => {
  const { amount, description, month, year } = req.body;

  if (amount === undefined || typeof amount !== 'number' || !description || !month || !year) {
    return res.status(400).json({ error: 'Missing or invalid data. Please ensure all fields are provided correctly.' });
  }

  let data = readJSON(expensesPath, []);

  if (typeof data[0] !== 'object' || Array.isArray(data[0])) {
    data[0] = {};
  }

  if (!data[0][year]) data[0][year] = {};
  if (!data[0][year][month]) data[0][year][month] = [];

  data[0][year][month].push({ amount, description });

  writeJSON(expensesPath, data);

  res.json({ success: true, message: 'Expense added successfully' });
});


// Get the financial summary for this month
app.get('/financial-summary', (req, res) => {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const donations = readJSON(donationPath, [{}]);
  const expenses = readJSON(expensesPath, [{}]);

  const thisMonthDonations = donations[0][year] && donations[0][year][month] 
    ? Object.values(donations[0][year][month]).reduce((acc, curr) => acc + curr, 0)
    : 0;

  const thisMonthExpenses = expenses[0][year] && expenses[0][year][month] 
    ? expenses[0][year][month].reduce((acc, expense) => acc + expense.amount, 0)
    : 0;

  let totalExpensesBeforeMonth = 0;
  for (let m = 1; m < month; m++) {
    if (expenses[0][year] && expenses[0][year][m]) {
      totalExpensesBeforeMonth += expenses[0][year][m].reduce((acc, expense) => acc + expense.amount, 0);
    }
  }

  const netAmount = thisMonthDonations - thisMonthExpenses;

  res.json({
    success: true,
    data: {
      thisMonthDonations,
      thisMonthExpenses,
      totalExpensesBeforeMonth,
      netAmount,
    },
  });
});

// ✅ NEW: Overall summary (total till date)
app.get('/overall-summary', (req, res) => {
  const donations = readJSON(donationPath, {});
  const expenses = readJSON(expensesPath, [{}]);

  let totalDonations = 0;
  let totalExpenses = 0;

  for (const year in donations) {
    for (const month in donations[year]) {
      for (const rollNo in donations[year][month]) {
        totalDonations += donations[year][month][rollNo];
      }
    }
  }

  if (expenses[0]) {
    for (const year in expenses[0]) {
      for (const month in expenses[0][year]) {
        totalExpenses += expenses[0][year][month].reduce((sum, expense) => sum + expense.amount, 0);
      }
    }
  }

  const netAmount = totalDonations - totalExpenses;

  res.json({
    success: true,
    data: {
      totalDonations,
      totalExpenses,
      netAmount
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
