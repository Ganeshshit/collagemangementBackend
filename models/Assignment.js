const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const assignmentSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  totalPoints: {
    type: Number,
    required: true
  },
  trainerResources: [{
    type: String,
    enum: ['notes', 'ppt'],
    required: true
  }],
  resources: [{
    type: {
      type: String,
      enum: ['notes', 'ppt'],
      required: true
    },
    fileUrl: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloadedAt: Date
  }],
  submissions: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    fileUrl: String,
    grade: Number,
    feedback: String,
    status: {
      type: String,
      enum: ['submitted', 'graded', 'late'],
      default: 'submitted'
    },
    downloadedResources: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssignmentResource'
    }],
    downloadHistory: [{
      resource: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AssignmentResource'
      },
      downloadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  totalPoints: {
    type: Number,
    required: true
  },
  trainerResources: [{
    type: String,
    enum: ['notes', 'ppt'],
    required: true
  }],
  resources: [{
    type: {
      type: String,
      enum: ['notes', 'ppt'],
      required: true
    },
    fileUrl: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  submissions: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    fileUrl: String,
    grade: Number,
    feedback: String,
    status: {
      type: String,
      enum: ['submitted', 'graded', 'late'],
      default: 'submitted'
    },
    downloadedResources: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssignmentResource'
    }]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment;
