const express = require('express');
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();
const { parse } = require('date-fns');
const { format } = require('date-fns');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

// Helper function to generate PDF report
async function generatePDFReport(data, filename) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const fontSize = 12;
  const timesRoman = await pdfDoc.embedFont('Times-Roman');
  
  // Add title
  page.drawText('Monthly Attendance Report', {
    x: 50,
    y: 750,
    size: 18,
    font: timesRoman
  });

  // Add date range
  page.drawText(`Month: ${data.month}/${data.year}`, {
    x: 50,
    y: 730,
    size: 14,
    font: timesRoman
  });

  // Add table header
  const header = ['Date', 'Status', 'Remarks'];
  let y = 700;
  header.forEach((text, index) => {
    page.drawText(text, {
      x: 50 + (index * 150),
      y: y,
      size: fontSize,
      font: timesRoman
    });
  });
  
  // Add data rows
  y -= 20;
  data.attendance.forEach(attendance => {
    const row = [
      format(attendance.date, 'dd/MM/yyyy'),
      attendance.status.toUpperCase(),
      attendance.remarks || ''
    ];
    
    row.forEach((text, index) => {
      page.drawText(text, {
        x: 50 + (index * 150),
        y: y,
        size: fontSize,
        font: timesRoman
      });
    });
    y -= 20;
  });

  // Add summary
  const totalDays = data.attendance.length;
  const present = data.attendance.filter(a => a.status === 'present').length;
  const absent = data.attendance.filter(a => a.status === 'absent').length;
  const late = data.attendance.filter(a => a.status === 'late').length;
  
  page.drawText(`\nSummary:`, {
    x: 50,
    y: y - 30,
    size: fontSize,
    font: timesRoman
  });
  
  page.drawText(`Total Days: ${totalDays}`, {
    x: 50,
    y: y - 50,
    size: fontSize,
    font: timesRoman
  });
  
  page.drawText(`Present: ${present}`, {
    x: 50,
    y: y - 70,
    size: fontSize,
    font: timesRoman
  });
  
  page.drawText(`Absent: ${absent}`, {
    x: 50,
    y: y - 90,
    size: fontSize,
    font: timesRoman
  });
  
  page.drawText(`Late: ${late}`, {
    x: 50,
    y: y - 110,
    size: fontSize,
    font: timesRoman
  });

  // Save PDF
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(filename, pdfBytes);
}

// Get monthly attendance report for a student
router.get('/monthly/:studentId', auth, authorize('trainer', 'admin'), async (req, res) => {
  try {
    const { month, year, courseId } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);

    const attendance = await Attendance.find({
      student: req.params.studentId,
      date: { $gte: startDate, $lte: endDate },
      course: courseId
    })
    .sort({ date: 1 })
    .populate('student', 'name rollNumber')
    .populate('markedBy', 'name');

    if (!attendance.length) {
      return res.status(404).json({ message: 'No attendance records found' });
    }

    // Generate filename
    const student = attendance[0].student;
    const filename = `attendance_report_${student.rollNumber}_${month}_${year}.pdf`;
    const filePath = path.join(__dirname, '../../reports', filename);

    // Generate PDF
    await generatePDFReport({
      month,
      year,
      attendance,
      student: student.name,
      rollNumber: student.rollNumber
    }, filePath);

    // Send file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ message: 'Error downloading file' });
      }
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get batch-wise monthly attendance report
router.get('/batch/:batchId', auth, authorize('trainer', 'admin'), async (req, res) => {
  try {
    const { month, year, courseId } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);

    // Get all students in the batch
    const students = await User.find({ batch: req.params.batchId, role: 'student' });
    
    // Get attendance for each student
    const attendanceReports = await Promise.all(students.map(async (student) => {
      const attendance = await Attendance.find({
        student: student._id,
        date: { $gte: startDate, $lte: endDate },
        course: courseId
      })
      .sort({ date: 1 });

      return {
        student: student.name,
        rollNumber: student.rollNumber,
        attendance,
        totalDays: attendance.length,
        present: attendance.filter(a => a.status === 'present').length,
        absent: attendance.filter(a => a.status === 'absent').length,
        late: attendance.filter(a => a.status === 'late').length
      };
    }));

    // Generate batch report PDF
    const filename = `batch_attendance_report_${req.params.batchId}_${month}_${year}.pdf`;
    const filePath = path.join(__dirname, '../../reports', filename);

    // Generate batch report
    await generateBatchPDFReport({
      month,
      year,
      reports: attendanceReports
    }, filePath);

    // Send file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ message: 'Error downloading file' });
      }
    });
  } catch (error) {
    console.error('Error generating batch report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to generate batch PDF report
function generateBatchPDFReport(data, filename) {
  return PDFDocument.create()
    .then(pdfDoc => {
      const page = pdfDoc.addPage([800, 1200]);
      const fontSize = 12;
      
      return pdfDoc.embedFont('Times-Roman')
        .then(timesRoman => {
          // Add title
          page.drawText('Batch Monthly Attendance Report', {
            x: 50,
            y: 1150,
            size: 18,
            font: timesRoman
          });

          // Add date range
          page.drawText(`Month: ${data.month}/${data.year}`, {
            x: 50,
            y: 1130,
            size: 14,
            font: timesRoman
          });

          // Add table header
          const header = ['Student', 'Roll No', 'Total Days', 'Present', 'Absent', 'Late'];
          let y = 1100;
          header.forEach((text, index) => {
            page.drawText(text, {
              x: 50 + (index * 100),
              y: y,
              size: fontSize,
              font: timesRoman
            });
          });
          
          // Add data rows
          y -= 20;
          data.reports.forEach(report => {
            const row = [
              report.student,
              report.rollNumber,
              report.totalDays,
              report.present,
              report.absent,
              report.late
            ];
            
            row.forEach((text, index) => {
              page.drawText(text.toString(), {
                x: 50 + (index * 100),
                y: y,
                size: fontSize,
                font: timesRoman
              });
            });
            y -= 20;
          });

          // Save PDF
          return pdfDoc.save();
        })
        .then(pdfBytes => fs.writeFile(filename, pdfBytes));
    });
}

module.exports = router;
