const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// madileWare

app.use(express.json());
app.use(cors());
// mongodb setup

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster-first-server-ap.bcgcgzv.mongodb.net/?appName=Cluster-first-server-app`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // Send a ping to confirm a successful connection
    const db = client.db("photography-club");
    const clubCollection = db.collection("club");

    // club api
    app.get("/club", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { email: email }; // assuming club document has email field
      }
      const result = await clubCollection.find(query).toArray();
      res.send(result);
    });
    //Club post
    app.post("/club", async (req, res) => {
      const club = req.body;
      const result = await clubCollection.insertOne(club);
      res.send(result);
    });
    // GET single club by id
    app.get("/club/:id", async (req, res) => {
      const id = req.params.id;
      const ObjectId = require("mongodb").ObjectId;
      const result = await clubCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);
//
app.get("/", (req, res) => {
  res.send("PhotoGraphy Club!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
