const swaggerJsdoc = require("swagger-jsdoc");


const options = {

    definition: {

        openapi: "3.0.0",

        info: {
            title: "SeeFixit API",
            version: "1.0.0",
            description:
                "API documentation for the SeeFixit civic issue reporting system."
        },

        servers: [
            {
                url: "http://localhost:5000"
            }
        ],

        components: {

            schemas: {

                Issue: {

                    type: "object",

                    properties: {

                        issue_id: {
                            type: "integer",
                            example: 1
                        },

                        issue_title: {
                            type: "string",
                            example: "Large pothole near main gate"
                        },

                        category: {
                            type: "string",
                            example: "ROAD"
                        },

                        status: {
                            type: "string",
                            example: "RESOLVED"
                        },

                        priority_score: {
                            type: "integer",
                            example: 50
                        },

                        department_name: {
                            type: "string",
                            example: "Road Department"
                        },

                        report_count: {
                            type: "string",
                            example: "4"
                        }

                    }

                }

            },


            // ==========================================
            // JWT Authentication
            // ==========================================

            securitySchemes: {

                bearerAuth: {

                    type: "http",

                    scheme: "bearer",

                    bearerFormat: "JWT"

                }

            }

        }

    },


    apis: [
        "./routes/*.js"
    ]

};


const swaggerSpec = swaggerJsdoc(options);


module.exports = swaggerSpec;