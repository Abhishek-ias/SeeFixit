const pool = require("./database");

pool.query("SELECT NOW()", (error, result) => {

    if (error) {
        console.log(error);
        return;
    }

    console.log(result.rows);
});