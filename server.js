const express = require("express");
const cors = require("cors"); // Import CORS
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 5000; // Use the PORT environment variable for Render

// Enable CORS for all domains (you can customize this if needed)
app.use(cors());

// Middleware to parse incoming JSON requests
app.use(express.json());

// Function to read data from JSON files
const readJSON = (fileName) => {
  const data = fs.readFileSync(fileName);
  return JSON.parse(data);
};

// Function to write data to JSON files
const writeJSON = (fileName, data) => {
  fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
};

// API to get all members' data with attendance and donations
app.get("/member-full-details", (req, res) => {
  const members = readJSON("members.json");
  const attendance = readJSON("attendance.json");
  const donations = readJSON("donations.json");

  const fullDetails = members.map((member) => {
    const roll_no = member.roll_no;
    const memberAttendance = attendance[roll_no] || [];
    const memberDonations = donations[roll_no] || {};

    return {
      ...member,
      attendance: memberAttendance,
      donations: memberDonations,
    };
  });

  res.json(fullDetails);
});

// API to update attendance for a specific roll number on a specific date
app.post("/update-attendance", express.json(), (req, res) => {
  const { roll_no, date, status } = req.body;

  if (!roll_no || !date || !status) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const attendance = readJSON("attendance.json");

  if (!attendance[roll_no]) {
    attendance[roll_no] = [];
  }

  attendance[roll_no].push({ date, status });

  writeJSON("attendance.json", attendance);

  res.json({ message: "Attendance updated successfully" });
});

// API to update donations for a specific roll number
app.post("/update-donations", express.json(), (req, res) => {
  const { roll_no, month, amount, date, mode } = req.body;

  if (!roll_no || !month || !amount || !date || !mode) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const donations = readJSON("donations.json");

  if (!donations[roll_no]) {
    donations[roll_no] = {};
  }

  donations[roll_no][month] = { amount, date, mode };

  writeJSON("donations.json", donations);

  res.json({ message: "Donation updated successfully" });
});

// API to calculate the total donation, expenses, and final amount
app.get("/total-donations", (req, res) => {
  const donations = readJSON("donations.json");
  const expenses = readJSON("expenses.json");

  // Calculate total donation amount from all members
  let totalDonation = 0;
  for (let roll_no in donations) {
    for (let month in donations[roll_no]) {
      totalDonation += donations[roll_no][month].amount;
    }
  }

  // Calculate total expenses
  let totalExpense = 0;
  for (let expense of expenses) {
    totalExpense += expense.amount;
  }

  // Final amount after deducting expenses
  const finalAmount = totalDonation - totalExpense;

  res.json({
    totalDonation,
    totalExpense,
    finalAmount,
  });
});

// API to add expenses and deduct them from the total donation amount
app.post("/add-expense", express.json(), (req, res) => {
  const { amount, date, description } = req.body;

  if (!amount || !date || !description) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const expenses = readJSON("expenses.json");

  // Add the new expense
  const newExpense = { amount, date, description };
  expenses.push(newExpense);

  // Save the updated expenses data
  writeJSON("expenses.json", expenses);

  // Calculate the total donation, expenses, and final amount
  const donations = readJSON("donations.json");
  let totalDonation = 0;
  for (let roll_no in donations) {
    for (let month in donations[roll_no]) {
      totalDonation += donations[roll_no][month].amount;
    }
  }

  let totalExpense = 0;
  for (let expense of expenses) {
    totalExpense += expense.amount;
  }

  const finalAmount = totalDonation - totalExpense;

  res.json({
    message: "Expense added successfully",
    totalDonation,
    totalExpense,
    finalAmount,
  });
});

// Server listening on PORT
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
