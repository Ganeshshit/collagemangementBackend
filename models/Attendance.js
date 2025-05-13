const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'excused'],
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  college: {
    type: String,
    required: true
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster querying
attendanceSchema.index({ student: 1, date: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
