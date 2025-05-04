const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadImage = async (file) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: 'red-pc-products',
      use_filename: true,
      unique_filename: true
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

// Extract public_id from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  try {
    // Example URL: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/red-pc-products/image_name.jpg
    const urlParts = url.split('/');
    // Find the index of upload in the URL parts
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    
    // Extract everything after 'upload' including the version number and folder
    const publicIdWithVersion = urlParts.slice(uploadIndex + 1).join('/');
    
    // Remove the file extension
    const publicId = publicIdWithVersion.replace(/\.[^/.]+$/, '');
    return publicId;
  } catch (error) {
    console.error('Error extracting public_id from URL:', error);
    return null;
  }
};

const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl) return null;
    
    const publicId = getPublicIdFromUrl(imageUrl);
    if (!publicId) {
      console.warn('Could not extract public_id from URL:', imageUrl);
      return null;
    }
    
    // Delete the image from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

module.exports = { uploadImage, deleteImage, getPublicIdFromUrl };