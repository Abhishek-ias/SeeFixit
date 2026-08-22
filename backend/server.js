const express = require("express");
const app = express();

app.get("/",(req,res) => {
    res.send("SeeFixit Backend running");
});

const port = 5000;

app.listen(port, () => {
    console.log(`SeeFixit server running on port ${port}`);
});