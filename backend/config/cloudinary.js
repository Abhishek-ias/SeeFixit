require("dotenv").config();

const { v2: cloudinary } = require("cloudinary");

const credentials = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY?.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim()
};

const configuredCount = Object.values(credentials)
    .filter(Boolean).length;

if (configuredCount !== 0 && configuredCount !== 3) {
    throw new Error(
        "Cloudinary requires all three credentials to be configured."
    );
}

const isConfigured = configuredCount === 3;

if (isConfigured) {
    cloudinary.config({
        cloud_name: credentials.cloudName,
        api_key: credentials.apiKey,
        api_secret: credentials.apiSecret,
        secure: true
    });
}

module.exports = {
    cloudinary,
    isConfigured
};
