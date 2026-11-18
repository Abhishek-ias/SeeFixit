const { cloudinary, isConfigured } = require("../config/cloudinary");
const AppError = require("./AppError");

/**
 * Upload a processed image buffer to Cloudinary.
 * Returns the secure URL and public_id.
 * Throws if Cloudinary is not configured.
 */
async function uploadToCloudinary(buffer, folder = "seefixit/reports") {
    if (!isConfigured) {
        throw new AppError(
            "Image storage is not configured. Contact support.",
            503
        );
    }

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image",
                format: "jpg",
                // Strip any residual metadata Cloudinary might preserve
                image_metadata: false,
                // Eager transformation: cap at 2560px, good quality
                eager: [
                    {
                        width: 2560,
                        height: 2560,
                        crop: "limit",
                        quality: 85,
                        fetch_format: "jpg"
                    }
                ]
            },
            (error, result) => {
                if (error) {
                    return reject(
                        new AppError(
                            "Image upload failed. Please try again.",
                            502
                        )
                    );
                }

                resolve({
                    publicId: result.public_id,
                    secureUrl: result.secure_url,
                    width: result.width,
                    height: result.height,
                    bytes: result.bytes
                });
            }
        );

        uploadStream.end(buffer);
    });
}

module.exports = { uploadToCloudinary };
