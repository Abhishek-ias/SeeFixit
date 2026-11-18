const {
    getMyReportById
} = require("../services/issueService");

async function authorizeReportOwner(req, res, next) {
    try {
        const report = await getMyReportById(
            req.params.id,
            req.user.userId
        );

        req.report = report;

        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = authorizeReportOwner;
