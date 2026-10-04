const Joi = require("joi");

const updateIssueStatusSchema = Joi.object({
    status: Joi.string()
        .valid("OPEN", "IN_PROGRESS", "RESOLVED")
        .required()
}).unknown(false);

const uploadEvidenceSchema = Joi.object({
    image: Joi.string()
        .trim()
        .allow("")
        .optional(),

    description: Joi.string()
        .trim()
        .max(1000)
        .allow("")
        .optional()
}).unknown(false);

module.exports = {
    updateIssueStatusSchema,
    uploadEvidenceSchema
};