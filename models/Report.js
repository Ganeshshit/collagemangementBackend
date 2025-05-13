const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Report title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Report description is required'],
    trim: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: [1, 'Semester must be at least 1'],
    max: [8, 'Semester cannot be more than 8']
  },
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    match: [/^\d{4}-\d{4}$/, 'Please provide a valid academic year (e.g., 2023-2024)']
  },
  reportFile: {
    filename: {
      type: String,
      required: [true, 'File name is required']
    },
    path: {
      type: String,
      required: [true, 'File path is required']
    },
    mimetype: {
      type: String,
      required: [true, 'File type is required'],
      enum: {
        values: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        message: 'Only PDF and Word documents are allowed'
      }
    },
    size: {
      type: Number,
      max: [10 * 1024 * 1024, 'File size cannot exceed 10MB']
    }
  },
  submissionDate: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator ID is required']
  },
  status: {
    type: String,
    enum: {
      values: ['draft', 'submitted', 'reviewed', 'approved', 'rejected', 'needs_revision'],
      message: 'Invalid status value'
    },
    default: 'submitted'
  },
  statusHistory: [{
    status: {
      type: String,
      required: true,
      enum: ['draft', 'submitted', 'reviewed', 'approved', 'rejected', 'needs_revision']
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment cannot be more than 500 characters']
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required for comment']
    },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      maxlength: [1000, 'Comment cannot be more than 1000 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date
    }
  }]
});

// Virtual for getting the report's file URL
reportSchema.virtual('fileUrl').get(function() {
  if (this.reportFile && this.reportFile.path) {
    // This assumes you have a static file serving route set up in Express
    return `/api/reports/download/${this._id}`;
  }
  return null;
});

// Create indexes for better query performance
reportSchema.index({ student: 1, status: 1 });
reportSchema.index({ createdBy: 1, status: 1 });
reportSchema.index({ 'student': 1, 'semester': 1, 'academicYear': 1 });
reportSchema.index({ 'status': 1, 'submissionDate': -1 });

// Add text index for search functionality
reportSchema.index({
  title: 'text',
  description: 'text',
  'comments.text': 'text'
});

// Update timestamps on save
reportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // If this is a new document or status is being updated, add to status history
  if (this.isNew || this.isModified('status')) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({
      status: this.status,
      changedBy: this.createdBy, // This will be updated in the route if needed
      changedAt: new Date()
    });
  }
  
  next();
});

// Update comment timestamps when comments are modified
reportSchema.pre('save', function(next) {
  if (this.isModified('comments')) {
    const now = new Date();
    this.comments.forEach(comment => {
      if (!comment.createdAt) {
        comment.createdAt = now;
      }
      comment.updatedAt = now;
    });
  }
  next();
});

// Instance method to add a comment
reportSchema.methods.addComment = async function(userId, text) {
  const comment = {
    user: userId,
    text,
    createdAt: new Date()
  };
  
  this.comments.push(comment);
  await this.save();
  
  // Return the populated comment
  return this.comments[this.comments.length - 1];
};

// Static method to get reports with filters
reportSchema.statics.findByFilters = async function(filters = {}) {
  const { 
    studentId, 
    facultyId, 
    status, 
    semester, 
    academicYear,
    page = 1, 
    limit = 10 
  } = filters;
  
  const query = {};
  
  if (studentId) query.student = studentId;
  if (status) query.status = status;
  if (semester) query.semester = semester;
  if (academicYear) query.academicYear = academicYear;
  
  // If facultyId is provided, only return reports for students assigned to this faculty
  if (facultyId) {
    const students = await mongoose.model('Student').find({ assignedFaculty: facultyId }, '_id');
    const studentIds = students.map(s => s._id);
    query.student = { $in: studentIds };
  }
  
  const skip = (page - 1) * limit;
  
  const reports = await this.find(query)
    .populate('student', 'firstName lastName rollNumber')
    .populate('createdBy', 'firstName lastName')
    .populate('comments.user', 'firstName lastName avatar')
    .sort({ submissionDate: -1 })
    .skip(skip)
    .limit(limit);
    
  const total = await this.countDocuments(query);
  
  return {
    reports,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total
    }
  };
};

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
