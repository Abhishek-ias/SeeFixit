const Joi = require("joi");


const createReportSchema = Joi.object({

    title: Joi.string()
        .trim()
        .min(5)
        .max(200)
        .required(),

    description: Joi.string()
        .trim()
        .min(10)
        .max(1000)
        .required(),

    category: Joi.string()
        .valid(
            "ROAD",
            "SANITATION",
            "WATER"
        )
        .required(),

    latitude: Joi.number()
        .min(-90)
        .max(90)
        .required(),

    longitude: Joi.number()
        .min(-180)
        .max(180)
        .required(),

    image: Joi.string()
        .trim()
        .allow("")
        .optional()

}).unknown(false);


module.exports = {
    createReportSchema
};