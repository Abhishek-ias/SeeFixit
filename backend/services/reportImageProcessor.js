const sharp = require("sharp");
const path = require("node:path");
const crypto = require("node:crypto");
const AppError = require("../utils/AppError");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_OUTPUT_DIMENSION = 2560;

const SUPPORTED_FORMATS = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
};

function sanitizeFilename(filename) {
    const baseName = path.posix.basename(
        String(filename || "").replace(/\\/g, "/")
    );

    const sanitized = baseName
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 255);

    return sanitized || "report-image";
}

async function processReportImage(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
        throw new AppError("An image file is required", 400);
    }

    const inputBuffer = file.buffer;

    if (inputBuffer.length === 0) {
        throw new AppError("Image file cannot be empty", 400);
    }

    if (inputBuffer.length > MAX_IMAGE_BYTES) {
        throw new AppError("Image must not exceed 5 MB", 413);
    }

    let metadata;

    try {
        metadata = await sharp(inputBuffer, {
            limitInputPixels: MAX_IMAGE_PIXELS,
            failOn: "error"
        }).metadata();
    } catch {
        throw new AppError("Invalid or corrupted image file", 400);
    }

    const actualMimeType = SUPPORTED_FORMATS[metadata.format];

    if (!actualMimeType) {
        throw new AppError(
            "Only JPEG, PNG and WebP images are supported",
            400
        );
    }

    if (file.mimetype !== actualMimeType) {
        throw new AppError(
            "Image content does not match its declared file type",
            400
        );
    }

    if (metadata.pages && metadata.pages > 1) {
        throw new AppError(
            "Animated or multi-page images are not supported",
            400
        );
    }

    if (
        !Number.isInteger(metadata.width) ||
        !Number.isInteger(metadata.height) ||
        metadata.width <= 0 ||
        metadata.height <= 0 ||
        metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) {
        throw new AppError(
            "Image dimensions are invalid or too large",
            400
        );
    }

    let output;

    try {
        output = await sharp(inputBuffer, {
            limitInputPixels: MAX_IMAGE_PIXELS,
            failOn: "error"
        })
            .rotate()
            .resize({
                width: MAX_OUTPUT_DIMENSION,
                height: MAX_OUTPUT_DIMENSION,
                fit: "inside",
                withoutEnlargement: true
            })
            .flatten({
                background: "#ffffff"
            })
            .jpeg({
                quality: 85,
                progressive: true
            })
            .toBuffer({
                resolveWithObject: true
            });
    } catch {
        throw new AppError("Unable to process uploaded image", 400);
    }

    const sha256 = crypto
        .createHash("sha256")
        .update(output.data)
        .digest("hex");

    return {
        originalFilename: sanitizeFilename(file.originalname),
        originalMimeType: actualMimeType,
        mimeType: "image/jpeg",
        originalFileSizeBytes: inputBuffer.length,
        fileSizeBytes: output.data.length,
        width: output.info.width,
        height: output.info.height,
        sha256,
        buffer: output.data
    };
}

module.exports = {
    processReportImage,
    MAX_IMAGE_BYTES,
    MAX_IMAGE_PIXELS
};
