const { isIP } = require("node:net");
const { ipKeyGenerator } = require("express-rate-limit");

// Creates a shared IP key generator for API and authentication limiters.
function createClientIpKeyGenerator({ isProduction }) {
    return function clientIpKeyGenerator(req) {
        const cloudflareIp = req.get
            ? req.get("CF-Connecting-IP")
            : req.headers?.["cf-connecting-ip"];

        // Production trusts only Cloudflare's single-value client IP.
        if (isProduction) {
            if (typeof cloudflareIp === "string") {
                const normalizedIp = cloudflareIp.trim();

                if (isIP(normalizedIp)) {
                    return ipKeyGenerator(normalizedIp);
                }
            }

            throw new Error(
                "Missing or invalid trusted CF-Connecting-IP header"
            );
        }

        // Development uses Express's client IP.
        if (typeof req.ip === "string") {
            const normalizedIp = req.ip.trim();

            if (isIP(normalizedIp)) {
                return ipKeyGenerator(normalizedIp);
            }
        }

        // Development-only fallback to the socket address.
        const socketIp = req.socket?.remoteAddress;

        if (typeof socketIp === "string" && isIP(socketIp)) {
            return ipKeyGenerator(socketIp);
        }

        throw new Error(
            "Unable to determine a valid client IP for rate limiting"
        );
    };
}

module.exports = createClientIpKeyGenerator;