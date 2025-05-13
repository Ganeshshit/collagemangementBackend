const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Creates a multer upload configuration
 * @param {string} subfolder - Subfolder within uploads directory
 * @returns {Object} Configured multer instance
 */
module.exports = function(subfolder = '') {
  // Define storage configuration
  const storage = multer.diskStorage({
    destination: function(req, file, cb) {
      const uploadDir = path.join(__dirname, `../public/uploads/${subfolder}`);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
      // Generate unique filename with timestamp and original extension
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
  });

  // File filter to accept only certain file types
  const fileFilter = (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
    }
  };

  // Configure multer with storage and file filter
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });
};
