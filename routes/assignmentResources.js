const express = require('express');
const Assignment = require('../models/Assignment');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const assignmentId = req.params.assignmentId;
    const uploadPath = path.join(__dirname, '../../uploads/assignments', assignmentId);
    
    // Create directory if it doesn't exist
    fs.mkdir(uploadPath, { recursive: true })
      .then(() => cb(null, uploadPath))
      .catch(err => cb(err));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// File filter to only allow notes and ppt files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      file.mimetype === 'application/vnd.ms-powerpoint') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and PPT files are allowed.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 50 // 50MB limit
  }
});

// Upload trainer resources (notes/PPT)
router.post('/:assignmentId/upload', auth, authorize('trainer'), upload.single('file'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const resourceType = req.body.type;
    if (!['notes', 'ppt'].includes(resourceType)) {
      return res.status(400).json({ message: 'Invalid resource type' });
    }

    // Check if resource type is allowed for this assignment
    if (!assignment.trainerResources.includes(resourceType)) {
      return res.status(400).json({ message: 'This type of resource is not allowed for this assignment' });
    }

    // Create resource object
    const resource = {
      type: resourceType,
      fileUrl: `/uploads/assignments/${req.params.assignmentId}/${req.file.filename}`,
      uploadedBy: req.user._id,
      uploadType: 'trainer'
    };

    assignment.resources.push(resource);
    await assignment.save();

    res.status(201).json({ 
      message: 'Resource uploaded successfully', 
      resource,
      metadata: {
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        fileName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Error uploading resource:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const resourceType = req.body.type;
    if (!['notes', 'ppt'].includes(resourceType)) {
      return res.status(400).json({ message: 'Invalid resource type' });
    }

    // Create resource object
    const resource = {
      type: resourceType,
      fileUrl: `/uploads/assignments/${req.file.filename}`,
      uploadedBy: req.user._id
    };

    assignment.resources.push(resource);
    await assignment.save();

    res.status(201).json({ message: 'Resource uploaded successfully', resource });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all resources for an assignment
router.get('/:assignmentId/resources', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('resources.uploadedBy', 'username email')
      .populate('resources.createdBy', 'username email');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get download statistics
    const downloadStats = assignment.resources.map(resource => ({
      ...resource.toObject(),
      downloadCount: resource.downloadCount,
      lastDownloadedAt: resource.lastDownloadedAt,
      uploadedByUsername: resource.uploadedBy ? resource.uploadedBy.username : 'Unknown'
    }));

    res.json({
      resources: downloadStats,
      metadata: {
        totalResources: downloadStats.length,
        totalDownloads: downloadStats.reduce((sum, r) => sum + r.downloadCount, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('resources.uploadedBy', 'username email');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment.resources);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Download resource
router.get('/download/:resourceId', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      'resources._id': req.params.resourceId
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    const resource = assignment.resources.id(req.params.resourceId);
    
    // Update download count and last downloaded time
    resource.downloadCount += 1;
    resource.lastDownloadedAt = new Date();
    
    // Update download history for student
    if (req.user.role === 'student') {
      const submission = assignment.submissions.find(
        sub => sub.student.toString() === req.user._id.toString()
      );

      if (submission) {
        const existingDownload = submission.downloadHistory.find(
          dh => dh.resource.toString() === resource._id.toString()
        );

        if (!existingDownload) {
          submission.downloadHistory.push({
            resource: resource._id,
            downloadedAt: new Date()
          });
        }
      }
    }

    await assignment.save();

    // Get file path
    const filePath = path.join(__dirname, '../../', resource.fileUrl);
    
    // Check if file exists
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    
    if (!fileExists) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Set headers
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(resource.fileUrl)}`);
    
    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading resource:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
  try {
    const assignment = await Assignment.findOne({
      'resources._id': req.params.resourceId
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    const resource = assignment.resources.id(req.params.resourceId);
    
    // Update download count for student
    if (req.user.role === 'student') {
      const submission = assignment.submissions.find(
        sub => sub.student.toString() === req.user._id.toString()
      );

      if (submission) {
        submission.downloadedResources.push(resource._id);
        await assignment.save();
      }
    }

    res.redirect(resource.fileUrl);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
