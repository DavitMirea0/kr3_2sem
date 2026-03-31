var express = require("express");
var path = require("path");
var app = express();

app.get("/sw.js", function (req, res) {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "sw.js"));
});

app.use(express.static(__dirname));

app.listen(8080, function () {
  console.log("http://localhost:8080");
});
