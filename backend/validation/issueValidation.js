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

const issueFilterSchema = Joi.object({
    category: Joi.string()
        .valid("ROAD", "SANITATION", "WATER")
        .optional(),

    status: Joi.string()
        .valid("OPEN", "IN_PROGRESS", "RESOLVED")
        .optional(),

    page: Joi.number()
        .integer()
        .min(1)
        .optional(),

    limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .optional()
}).unknown(false);

module.exports = {
    updateIssueStatusSchema,
    uploadEvidenceSchema,
    issueFilterSchema
};