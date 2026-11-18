const multer = require("multer");
const AppError = require("../utils/AppError");
const {
    MAX_IMAGE_BYTES
} = require("../services/reportImageProcessor");

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

const parser = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
        fields: 0,
        parts: 1,
        fieldNameSize: 32,
        headerPairs: 100
    },

    fileFilter(req, file, callback) {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return callback(
                new AppError(
                    "Only JPEG, PNG and WebP images are accepted",
                    400
                )
            );
        }

        callback(null, true);
    }
}).single("image");

function uploadReportImage(req, res, next) {
    parser(req, res, (error) => {
        if (error) {
            if (error instanceof multer.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    return next(
                        new AppError(
                            "Image must not exceed 5 MB",
                            413
                        )
                    );
                }

                if (
                    error.code === "LIMIT_UNEXPECTED_FILE"
                ) {
                    return next(
                        new AppError(
                            "Upload exactly one image using the image field",
                            400
                        )
                    );
                }

                return next(
                    new AppError(
                        "Invalid multipart upload",
                        400
                    )
                );
            }

            return next(error);
        }

        if (!req.file) {
            // Image is optional — continue without file
            return next();
        }

        next();
    });
}

module.exports = uploadReportImage;
