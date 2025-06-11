const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 5000;

// CORS setup for live environment
const allowedOrigins = [
  "https://fancy-cat-e57b88.netlify.app",
  "https://langar-db-csvv.onrender.com",
  "http://localhost:5000",
  "http://localhost:3000",
  "https://timely-pegasus-f577f8.netlify.app",
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
app.use("/images", express.static(path.join(__dirname, "data/uploads")));

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

const uploadPath = path.join(__dirname, "data", "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const rollNo = req.body.roll_no;
    const ext = path.extname(file.originalname); // e.g., .jpg, .png
    cb(null, `${rollNo}${ext}`);
  },
});

const upload = multer({ storage });

app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true }));

// Routes

// Route to download entire backend folder as zip
app.get("/download-backend", (req, res) => {
  const folderToZip = __dirname; // This will zip the entire backend folder

  const zipFileName = "backend.zip";
  res.setHeader("Content-Disposition", `attachment; filename=${zipFileName}`);
  res.setHeader("Content-Type", "application/zip");

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);

  // Zip the current backend folder but exclude node_modules and zip itself if needed
  archive.glob("**/*", {
    cwd: folderToZip,
    ignore: ["node_modules/**", "backend.zip", "data/uploads/**"], // Optional: exclude heavy folders
  });

  archive.finalize();
});

app.get("/download-all-images", (req, res) => {
  const uploadDir = path.join(__dirname, "data", "uploads");

  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ error: "Upload directory not found." });
  }

  const zipFileName = "all-member-images.zip";
  res.setHeader("Content-Disposition", `attachment; filename=${zipFileName}`);
  res.setHeader("Content-Type", "application/zip");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  archive.directory(uploadDir, false); // false to avoid nesting folder in zip
  archive.finalize();
});

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
  const amount = Number(req.body.amount);

  // Validate input
  if (!year || !month || !rollNo || isNaN(amount)) {
    return res.status(400).json({ error: "Missing or invalid data" });
  }

  // Read existing data
  let data = readJSON(donationPath, {});

  // Initialize nested structure
  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};
  if (typeof data[year][month][rollNo] !== "number") {
    data[year][month][rollNo] = 0;
  }

  // Add to existing amount
  data[year][month][rollNo] += amount;

  // Write back to file
  writeJSON(donationPath, data);

  res.json({ success: true, message: `Donation updated successfully` });
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

// Delete expense data
app.post("/delete-expense", (req, res) => {
  const { year, month, index } = req.body;

  if (!year || !month || index === undefined || typeof index !== "number") {
    return res.status(400).json({
      error: "Missing or invalid data. Please provide year, month, and index.",
    });
  }

  let data = readJSON(expensesPath, []);

  if (
    !data[0] ||
    !data[0][year] ||
    !data[0][year][month] ||
    !Array.isArray(data[0][year][month])
  ) {
    return res.status(404).json({ error: "Expense entry not found." });
  }

  if (index < 0 || index >= data[0][year][month].length) {
    return res.status(400).json({ error: "Invalid expense index." });
  }

  // Remove the specific expense
  data[0][year][month].splice(index, 1);

  writeJSON(expensesPath, data);

  res.json({ success: true, message: "Expense deleted successfully" });
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
  let member = members.find((m) => parseInt(m.roll_no) === roll);
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

app.post("/edit-member", upload.single("image"), (req, res) => {
  const { roll_no, name, last_name, phone_no, address } = req.body;

  if (!roll_no) {
    return res.status(400).json({ error: "Roll number is required" });
  }

  const dataPath = path.join(__dirname, "data", "members.json");
  let members = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const index = members.findIndex(
    (m) => parseInt(m.roll_no) === parseInt(roll_no)
  );

  if (index === -1) {
    // If member does not exist, add new member
    const newMember = {
      roll_no,
      name: name || "",
      last_name: last_name || "",
      phone_no: phone_no || "",
      address: address || "",
      img: req.file ? req.file.filename : "",
    };
    members.push(newMember);

    fs.writeFileSync(dataPath, JSON.stringify(members, null, 2));

    return res.status(201).json({
      success: true,
      message: "New member added successfully",
      member: newMember,
    });
  }

  // If member exists, update their details
  if (name) members[index].name = name;
  if (last_name) members[index].last_name = last_name;
  if (phone_no) members[index].phone_no = phone_no;
  if (address) members[index].address = address;
  if (req.file) members[index].img = req.file.filename;

  fs.writeFileSync(dataPath, JSON.stringify(members, null, 2));

  res.json({
    success: true,
    message: "Member details updated successfully",
    member: members[index],
  });
});

app.get("/all-images", (req, res) => {
  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to read upload directory" });
    }

    const fileUrls = files.map((file) => ({
      name: file,
      url: `/images/${file}`,
    }));

    res.json(fileUrls);
  });
});

app.use("/uploads", express.static(path.join(__dirname, "data", "uploads")));

// POST /empty-rollno

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
  let totalFines = 0; // Added a variable for total fines
  let totalExpenses = 0;

  // Sum all donations and fines
  for (const year in donations) {
    for (const month in donations[year]) {
      for (const rollNo in donations[year][month]) {
        const value = donations[year][month][rollNo];

        if (typeof value === "number") {
          totalDonations += value; // If the value is a number, add it to donations
        } else if (typeof value === "object" && value !== null) {
          if ("donation" in value) {
            totalDonations += Number(value.donation || 0); // Add donation if present
          }
          if ("fine" in value) {
            totalFines += Number(value.fine || 0); // Add fine if present
          }
        }
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

  const netAmount = totalDonations + totalFines - totalExpenses;

  res.json({
    success: true,
    data: {
      totalDonations, // This now includes donations and fines
      totalFines, // Returning total fines separately
      totalExpenses,
      netAmount,
    },
  });
});

const backupBase = path.join(__dirname, "backup");
const dayFolder = path.join(backupBase, "day-backup");
const weekFolder = path.join(backupBase, "week-backup");
const monthFolder = path.join(backupBase, "month-backup");

// Ensure all folders exist
[backupBase, dayFolder, weekFolder, monthFolder].forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

// Common backup function
const createBackupZip = (targetFolder, label) => {
  // Ensure only the latest 10 files remain
  const existingFiles = fs
    .readdirSync(targetFolder)
    .filter((file) => file.endsWith(".zip"))
    .map((file) => ({
      name: file,
      time: fs.statSync(path.join(targetFolder, file)).ctimeMs,
    }))
    .sort((a, b) => a.time - b.time); // oldest first

  // If already 10, delete the oldest
  if (existingFiles.length >= 5) {
    const oldestFile = existingFiles[0].name;
    const filePathToDelete = path.join(targetFolder, oldestFile);
    fs.unlinkSync(filePathToDelete);
    console.log(`🗑️ Deleted oldest ${label} backup: ${oldestFile}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFilePath = path.join(
    targetFolder,
    `backup-${label}-${timestamp}.zip`
  );
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(
      `✅ ${label} backup created: ${zipFilePath} (${archive.pointer()} bytes)`
    );
  });

  archive.on("error", (err) => {
    console.error(`❌ Error creating ${label} backup:`, err);
  });

  archive.pipe(output);

  archive.glob("**/*", {
    cwd: __dirname,
    ignore: ["node_modules/**", "backup/**", "data/uploads/**"],
  });

  archive.finalize();
};

// 🗓️ Daily backup at 3:00 AM
cron.schedule("0 3 * * *", () => {
  console.log("⏰ Running DAILY backup...");
  createBackupZip(dayFolder, "daily");
});

// 🗓️ Weekly backup on Monday at 4:00 AM
cron.schedule("0 4 * * 1", () => {
  console.log("⏰ Running WEEKLY backup...");
  createBackupZip(weekFolder, "weekly");
});

// 🗓️ Monthly backup on 1st of month at 5:00 AM
cron.schedule("0 5 1 * *", () => {
  console.log("⏰ Running MONTHLY backup...");
  createBackupZip(monthFolder, "monthly");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
