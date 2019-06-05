// get all required items
var express = require("express");
var engines = require("consolidate");
var mongodb = require("mongodb");
var MongoClient = mongodb.MongoClient;
var bodyParser = require("body-parser");
var assert = require("assert");
var logger = require("morgan");
var path = require("path");
var favicon = require("serve-favicon");
var socketio = require("socket.io");
var port = process.env.PORT || 3000;
var mongoUri =
  process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  "mongodb://localhost:27017/chat";
var app = express();

// configure our server
app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.use(logger("dev"));
app.engine("html", engines.nunjucks);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// make sure we can connect to database before starting server
MongoClient.connect(mongoUri, function(err, db) {
  assert.equal(null, err);
  console.log("Successfully connected to mongodb");

  app.get("/messages", function(req, res) {
    db.collection("messages")
      .find({})
      .sort({ createdAt: -1 })
      .toArray(function(err, docs) {
        res.json(docs);
      });
  });

  app.post("/messages/:order", function(req, res) {
    var filter = req.body.filter;
    var order = parseInt(req.params.order);
    var query = {};
    query["user._id"] = filter.user._id;
    query["createdAt"] = {
      $gte: req.body.filter.date + "T00:00:00.184Z",
      $lte: req.body.filter.date + "T23:59:00.184Z"
    };

    db.collection("messages")
      .find(query)
      .sort({ createdAt: order })
      .toArray(function(err, docs) {
        console.log(docs);
        res.json(docs);
      });
  });

  app.post("/new/message", function(req, res) {
    var data = req.body;
    db.collection("messages").insertOne(data, function(err, doc) {
      assert.equal(null, err);
      websocket.emit("new-message", doc.ops[0]);
      // res.json(doc);
    });
  });

  app.post("/delete/message", function(req, res) {
    var id = req.body.id;
    db.collection("messages").deleteOne({ _id: mongodb.ObjectID(id) }, function(
      err,
      doc
    ) {
      assert.equal(null, err);
      console.log(doc.result.n + " document(s) deleted");
      websocket.emit("remove-message", id);
      // res.json(doc);
    });
  });

  app.get("/users", function(req, res) {
    db.collection("users")
      .find({})
      .toArray(function(err, docs) {
        res.json(docs);
      });
  });

  app.get("/users/:username", function(req, res) {
    var _username = req.params.username;

    db.collection("users").findOne({ username: _username }, function(err, doc) {
      res.json(doc);
    });
  });

  app.post("/new/user", function(req, res) {
    var data = req.body;

    db.collection("users").insertOne(data, function(err, doc) {
      assert.equal(null, err);
      res.json(doc);
    });
  });

  app.post("/users/login", function(req, res) {
    var data = req.body;
    let user = null;

    db.collection("users").findOne({ username: data.username }, function(
      err,
      doc
    ) {
      assert.equal(null, err);
      user = doc;

      if (user != null) {
        res.json(user);
      } else {
        db.collection("users").insertOne(data, function(err, doc) {
          assert.equal(null, err);
          res.json(doc.ops[0]);
        });
      }
    });
  });

  app.post("/admin/login", function(req, res) {
    var data = req.body;
    var admin = null;

    db.collection("admins").findOne(
      { username: data.username, password: data.password },
      function(err, doc) {
        admin = doc;

        if (admin != null) {
          res.json(admin);
        } else {
          res.status(500).json("Usuário não encontrado!");
        }
      }
    );
  });

  app.post("/new/admin", function(req, res) {
    var data = req.body;
    var admin = null;
    db.collection("admins").findOne(
      { username: data.username, password: data.password },
      function(err, doc) {
        admin = doc;

        if (admin != null) {
          res.status(500).json("Usuário já existe!");
        } else {
          db.collection("admins").insertOne(data, function(err, doc) {
            assert.equal(null, err);
            res.json(doc.ops[0]);
          });
        }
      }
    );
  });

  // catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    next(err);
  });

  // error handlers

  // development error handler
  // will print stacktrace
  if (app.get("env") === "development") {
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render("error", {
        message: err.message,
        error: err
      });
    });
  }

  // production error handler
  // no stacktraces leaked to user
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render("error", {
      message: err.message,
      error: {}
    });
  });

  let server = app.listen(port, function() {
    console.log("Server listening on port 3000");
  });

  var websocket = socketio(server);

  websocket.on("connection", socket => {
    console.log("A client just joined on", socket.id);
  });
});
