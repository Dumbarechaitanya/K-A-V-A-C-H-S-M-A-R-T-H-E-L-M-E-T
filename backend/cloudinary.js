const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'wgjserfw',
  api_key: process.env.CLOUDINARY_API_KEY || '266492679851421',
  api_secret: process.env.CLOUDINARY_API_SECRET || '67PU57svU1QOLJkvAt-gLfjunVg',
  secure: true
});

// Upload a generated JSON report or snapshot buffer to Cloudinary
async function uploadReportToCloudinary(dataBuffer, filename = 'incident-report.json') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'smart-helmet-reports',
        resource_type: 'raw',
        public_id: `${Date.now()}_${filename}`
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary Upload Error:', error);
          return reject(error);
        }
        console.log('☁️ Report uploaded to Cloudinary:', result.secure_url);
        resolve(result);
      }
    );
    uploadStream.end(dataBuffer);
  });
}

module.exports = {
  cloudinary,
  uploadReportToCloudinary
};
