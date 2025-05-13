const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(endDate) {
        return endDate > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  trainers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Additional metadata
  maxStudents: {
    type: Number,
    min: 1,
    default: 30
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Custom fields for specific requirements
  customFields: {
    type: Map,
    of: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for batch duration in weeks
batchSchema.virtual('durationWeeks').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
});

// Virtual for student count
batchSchema.virtual('studentCount').get(function() {
  return this.students ? this.students.length : 0;
});

// Virtual for course count
batchSchema.virtual('courseCount', {
  ref: 'Course',
  localField: '_id',
  foreignField: 'batchId',
  count: true
});

// Indexes for better query performance
batchSchema.index({ name: 1 });
batchSchema.index({ code: 1 }, { unique: true });
batchSchema.index({ startDate: 1 });
batchSchema.index({ endDate: 1 });
batchSchema.index({ isActive: 1 });

// Pre-save hook to update timestamps
batchSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if a user is a trainer in this batch
batchSchema.methods.isTrainer = function(userId) {
  return this.trainers.some(trainerId => trainerId.toString() === userId.toString());
};

// Method to check if a user is a student in this batch
batchSchema.methods.isStudent = function(userId) {
  return this.students.some(studentId => studentId.toString() === userId.toString());
};

// Method to get batch statistics
batchSchema.methods.getStats = async function() {
  const Course = mongoose.model('Course');
  const Assignment = mongoose.model('Assignment');
  
  const [courseCount, studentCount, assignmentCount] = await Promise.all([
    Course.countDocuments({ batchId: this._id }),
    this.students ? this.students.length : 0,
    Assignment.countDocuments({ 
      course: { $in: await Course.find({ batchId: this._id }).select('_id') }
    })
  ]);

  return {
    courseCount,
    studentCount,
    assignmentCount,
    durationWeeks: this.durationWeeks
  };
};

// Static method to find active batches
batchSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to find batches by trainer
batchSchema.statics.findByTrainer = function(trainerId) {
  return this.find({ trainers: trainerId });
};

// Static method to find batches by student
batchSchema.statics.findByStudent = function(studentId) {
  return this.find({ students: studentId });
};

const Batch = mongoose.model('Batch', batchSchema);

module.exports = Batch;
