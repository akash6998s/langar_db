const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// CORS setup for live environment
const allowedOrigins = [
  "https://fancy-cat-e57b88.netlify.app",
  "https://langar-db-csvv.onrender.com",
  "http://localhost:5000",
  "http://localhost:3000",
];
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(cors(corsOptions));
app.use(express.json());

// File paths for storing data
const attendancePath = path.join(__dirname, "data", "attendance.json");
const membersPath = path.join(__dirname, "data", "members.json");
const donationPath = path.join(__dirname, "data", "donations.json");
const expensesPath = path.join(__dirname, "data", "expenses.json");

// Helper functions
const readJSON = (filePath, defaultValue) => {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    const data = fs.readFileSync(filePath, "utf-8");
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
app.get("/member-full-details", (req, res) => {
  const members = readJSON(membersPath, []);
  res.json(members);
});

// Get attendance data
app.get("/attendance", (req, res) => {
  const attendance = readJSON(attendancePath, []);
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

  return monthMap[monthName] || null; // Return null if invalid month name
};

// Helper function to convert month number to month name
const monthNumberToName = (monthNumber) => {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return monthNames[monthNumber - 1] || null;
};

// Update attendance data with month names instead of numbers
app.post("/update-attendance", (req, res) => {
  const { year, month, day, attendance } = req.body;

  if (!year || !month || !day || !Array.isArray(attendance)) {
    return res.status(400).json({ error: "Missing or invalid data" });
  }

  // Convert month name to number
  const monthNumber = monthNameToNumber(month);
  if (!monthNumber) {
    return res.status(400).json({ error: "Invalid month name" });
  }

  // Read the current attendance data
  let data = readJSON(attendancePath, [{}]);

  if (typeof data[0] !== "object" || Array.isArray(data[0])) {
    data[0] = {};
  }

  // Initialize the year, month (as month name), and day if they don't exist
  if (!data[0][year]) data[0][year] = {};
  const monthName = monthNumberToName(monthNumber); // Get the month name
  if (!data[0][year][monthName]) data[0][year][monthName] = {};
  if (!data[0][year][monthName][day]) data[0][year][monthName][day] = {};

  // Mark attendance for roll numbers in the "attendance" array
  attendance.forEach((rollNo) => {
    data[0][year][monthName][day][rollNo] = "present"; // Mark the rollNo as present
  });

  // Write the updated attendance data
  writeJSON(attendancePath, data);

  res.json({ success: true, message: "Attendance updated successfully" });
});

app.post("/delete-attendance", (req, res) => {
  const { year, month, day, attendance } = req.body;

  // Validate input
  if (!year || !month || !day || !Array.isArray(attendance)) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  const monthNumber = monthNameToNumber(month);
  if (!monthNumber) {
    return res.status(400).json({ error: "Invalid month name" });
  }

  let data = readJSON(attendancePath, [{}]);

  const dateAttendance = data[0]?.[year]?.[month]?.[String(day)];
  if (!dateAttendance) {
    return res
      .status(404)
      .json({ error: "No attendance data found for that date" });
  }

  let deleted = [];

  attendance.forEach((rollNo) => {
    if (dateAttendance[rollNo]) {
      delete dateAttendance[rollNo];
      deleted.push(rollNo);
    }
  });

  if (deleted.length === 0) {
    return res.status(404).json({
      error: "None of the selected roll numbers were found in attendance data.",
    });
  }

  writeJSON(attendancePath, data);

  return res.json({
    success: true,
    deleted,
    message: `Attendance Deleted`,
  });
});

// Get donations data
app.get("/donations", (req, res) => {
  const donations = readJSON(donationPath, []);
  res.json(donations);
});

// Get all expense details
app.get("/expenses", (req, res) => {
  const expenses = readJSON(expensesPath, []);
  res.json(expenses);
});

// Update donations data
app.post("/update-donations", (req, res) => {
  const { year, month, rollNo } = req.body;
  const amount = Number(req.body.amount); // Parse amount to number

  // Validate input
  if (!year || !month || !rollNo || isNaN(amount)) {
    return res.status(400).json({ error: "Missing or invalid data" });
  }

  // Read existing donation data
  let data = readJSON(donationPath, {});

  // Initialize nested objects if not present
  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};

  // Initialize donation amount for rollNo if not present
  if (typeof data[year][month][rollNo] !== "number") {
    data[year][month][rollNo] = 0;
  }

  // Add the new amount to the existing amount
  data[year][month][rollNo] += amount;

  // Save updated data
  writeJSON(donationPath, data);

  res.json({ success: true, message: "Donation updated successfully" });
});

// Add expense data
app.post("/add-expense", (req, res) => {
  const { amount, description, month, year } = req.body;

  if (
    amount === undefined ||
    typeof amount !== "number" ||
    !description ||
    !month ||
    !year
  ) {
    return res.status(400).json({
      error:
        "Missing or invalid data. Please ensure all fields are provided correctly.",
    });
  }

  let data = readJSON(expensesPath, []);

  if (typeof data[0] !== "object" || Array.isArray(data[0])) {
    data[0] = {};
  }

  if (!data[0][year]) data[0][year] = {};
  if (!data[0][year][month]) data[0][year][month] = [];

  data[0][year][month].push({ amount, description });

  writeJSON(expensesPath, data);

  res.json({ success: true, message: "Expense added successfully" });
});

// Delete a member by roll number
app.post("/delete-member", (req, res) => {
  const { rollNo } = req.body;
  if (!rollNo)
    return res.status(400).json({ message: "Roll number is required." });

  const members = readJSON(membersPath, []); // Use readJSON function
  const donations = readJSON(donationPath, {}); // Ensure correct read from donationPath
  const additionalPath = path.join(__dirname, "data", "additional.json");
  const additional = fs.existsSync(additionalPath)
    ? readJSON(additionalPath, {})
    : {}; // Correct path for additional data

  const roll = parseInt(rollNo);
  let member = members.find((m) => m.roll_no === roll);
  if (!member) return res.status(404).json({ message: "Member not found." });

  // Clear personal info
  member.name = "";
  member.last_name = "";
  member.phone_no = "";
  member.address = "";

  // Calculate total donation from this rollNo
  let totalRemoved = 0;
  for (let year in donations) {
    for (let month in donations[year]) {
      for (let roll in donations[year][month]) {
        if (parseInt(roll) === rollNo) {
          totalRemoved += donations[year][month][roll];
          delete donations[year][month][roll];
        }
      }
    }
  }

  // Update additional.json
  additional.donatedRemoved = (additional.donatedRemoved || 0) + totalRemoved;

  // Write updates
  writeJSON(membersPath, members);
  writeJSON(donationPath, donations);
  writeJSON(additionalPath, additional);

  res.json({
    message: `Member removed. Total donation of ₹${totalRemoved} was added to removed record.`,
  });
});

// POST /add-member

const membersFilePath = path.join(__dirname, "data/members.json");

app.post("/add-member", (req, res) => {
  const newMember = req.body;

  if (!newMember.roll_no) {
    return res.status(400).json({ message: "roll_no is required" });
  }

  try {
    const membersData = JSON.parse(fs.readFileSync(membersFilePath, "utf-8"));

    const existingIndex = membersData.findIndex(
      (m) => String(m.roll_no) === String(newMember.roll_no)
    );
    

    if (existingIndex !== -1) {
      const existingMember = membersData[existingIndex];

      if (existingMember.name && existingMember.name.trim() !== "") {
        // Case: roll_no exists and name is NOT empty
        return res
          .status(409)
          .json({ message: "Member with this roll number already exists" });
      } else {
        // Case: roll_no exists and name is empty — update the record
        membersData[existingIndex] = { ...existingMember, ...newMember };
        fs.writeFileSync(
          membersFilePath,
          JSON.stringify(membersData, null, 2),
          "utf-8"
        );
        return res.status(200).json({
          message: "Member details updated successfully",
          member: membersData[existingIndex],
        });
      }
    }

    // New member — add to list
    membersData.push(newMember);
    fs.writeFileSync(
      membersFilePath,
      JSON.stringify(membersData, null, 2),
      "utf-8"
    );
    res
      .status(201)
      .json({ message: "Member added successfully", member: newMember });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error reading or writing member data", error });
  }
});

// POST /empty-rollno

app.get('/empty-rollno', (req, res) => {
  const filePath = path.join(__dirname, 'data/members.json');

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read members.json' });
    }

    try {
      const members = JSON.parse(data);

      // Filter members with empty name and get their roll numbers
      const emptyNameRollNumbers = members
        .filter(member => member.name === "")
        .map(member => member.roll_no);

      // Get the total number of members + 1 (next roll number)
      const nextRollNo = members.length + 1;

      // Combine both arrays: empty roll numbers and total member count + 1
      const response = [
        ...emptyNameRollNumbers,
        nextRollNo
      ];

      res.json(response);
    } catch (parseErr) {
      res.status(500).json({ error: 'Error parsing JSON file' });
    }
  });
});

// Get additional data
app.get("/additional", (req, res) => {
  const additionalPath = path.join(__dirname, "data", "additional.json");

  // Read and return the additional data
  const additionalData = readJSON(additionalPath, {});
  res.json(additionalData);
});


// ✅ NEW: Overall summary (total till date)
app.get("/overall-summary", (req, res) => {
  const donations = readJSON(donationPath, {});
  const expensesData = readJSON(expensesPath, []);

  let totalDonations = 0;
  let totalExpenses = 0;

  // Sum all donations
  for (const year in donations) {
    for (const month in donations[year]) {
      for (const rollNo in donations[year][month]) {
        totalDonations += Number(donations[year][month][rollNo] || 0);
      }
    }
  }

  // Sum all expenses
  if (expensesData.length > 0) {
    const expenses = expensesData[0];
    for (const year in expenses) {
      for (const month in expenses[year]) {
        totalExpenses += expenses[year][month].reduce(
          (sum, exp) => sum + Number(exp.amount || 0),
          0
        );
      }
    }
  }

  const netAmount = totalDonations - totalExpenses;

  res.json({
    success: true,
    data: {
      totalDonations,
      totalExpenses,
      netAmount,
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
