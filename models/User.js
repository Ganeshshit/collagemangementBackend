const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'trainer', 'faculty', 'admin', 'superadmin'],
    required: true
  },
  // Student specific fields
  studentInfo: {
    phoneNumber: String,
    gender: {
      type: String,
      enum: ['male', 'female', 'other']
    },
    dateOfBirth: Date,
    branch: String,
    semester: Number,
    rollNumber: String,
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String
    },
    certifications: [{
      name: String,
      issuer: String,
      date: Date,
      expiryDate: Date,
      credentialId: String
    }],
    skills: [String],
    achievements: [{
      title: String,
      description: String,
      date: Date
    }],
    education: [{
      degree: String,
      institution: String,
      year: Number,
      percentage: Number
    }]
  },
  // Trainer specific fields
  trainerInfo: {
    specialization: [String],
    experience: Number,
    phoneNumber: String,
    qualifications: [{
      degree: String,
      institution: String,
      year: Number
    }],
    courses: [{
      name: String,
      description: String,
      startDate: Date,
      endDate: Date
    }]
  },
  // Admin specific fields
  adminInfo: {
    department: String,
    phoneNumber: String,
    permissions: [String]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
