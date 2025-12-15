const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// payment
const stripe = require("stripe")(process.env.STRIPE_SECRET);
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
    // payment related api
    // app.post("/create-checkout-section", async (req, res) => {
    //   const paymentInfo = req.body;
    //   const amount = parseInt(paymentInfo.membershipFee) * 100;
    //   const session = await stripe.checkout.sessions.create({
    //     line_items: [
    //       {
    //         price_data: {
    //           currency: "USD",

    //           unit_amount: amount,
    //           club_data: {
    //             name: paymentInfo.clubName,
    //           },
    //         },
    //         quantity: 1,
    //       },
    //     ],
    //     customer_email: paymentInfo.email,
    //     mode: "payment",
    //     metadata: {
    //       clubId: paymentInfo.clubId,
    //     },
    //     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
    //     cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
    //   });
    //   console.log(session);
    //   res.send({ url: session.url });
    // });

    // payment related api
    app.post("/create-checkout-section", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.membershipFee) * 100;

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  // ✅ সঠিক
                  name: paymentInfo.clubName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.email,
          mode: "payment",
          metadata: {
            clubId: paymentInfo.clubId,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error.message);
        res.status(400).send({ error: error.message });
      }
    });
    // payment success
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log("session id", sessionId);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("session retrieve", session);
      if (session.payment_status === "paid") {
        const id = session.metadata.clubId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            status: "paid",
          },
        };
        const result = await clubCollection.updateOne(query, update);
        res.send(result);
      }
      res.send({ success: false });
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
