const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//
const admin = require("firebase-admin");

// const serviceAccount = require("./fiarbase-admin-key.json");

// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// payment
const stripe = require("stripe")(process.env.STRIPE_SECRET);
// madileWare

app.use(express.json());
app.use(cors());

const verifyFBtoken = async (req, res, next) => {
  // console.log("headers in the madileWare", req.headers.authorization);
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};
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
    // await client.connect();
    // Send a ping to confirm a successful connection
    const db = client.db("photography-club");
    const clubCollection = db.collection("club");
    const userCollection = db.collection("users");
    const managerCollection = db.collection("manager");
    const eventCollection = db.collection("events");
    const eventRegistrationCollection = db.collection("eventRegistrations");

    //

    // payment

    app.post(
      "/create-event-checkout-session",
      verifyFBtoken,
      async (req, res) => {
        try {
          const info = req.body;
          const amount = parseInt(info.eventFee) * 100;

          const session = await stripe.checkout.sessions.create({
            line_items: [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: amount,
                  product_data: {
                    name: `Event: ${info.eventTitle}`,
                    description: `Club: ${info.clubName}`,
                  },
                },
                quantity: 1,
              },
            ],
            customer_email: info.userEmail,
            mode: "payment",
            metadata: {
              type: "event_registration",
              eventId: info.eventId,
              eventTitle: info.eventTitle,
              clubId: info.clubId,
              clubName: info.clubName,
              eventDate: info.eventDate,
              userEmail: info.userEmail,
              userName: info.userName,
            },
            success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/all-events`,
          });

          res.send({ url: session.url });
        } catch (error) {
          res.status(400).send({ error: error.message });
        }
      }
    );
    // Payment success

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res.status(400).send({ message: "No session ID" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        if (session.payment_status === "paid") {
          const alreadyExists = await eventRegistrationCollection.findOne({
            transactionId,
          });

          if (alreadyExists) {
            return res.send({
              success: true,
              message: "Already recorded",
              transactionId,
            });
          }

          if (session.metadata.type === "event_registration") {
            const meta = session.metadata;
            const registration = {
              eventId: meta.eventId,
              eventTitle: meta.eventTitle,
              userEmail: meta.userEmail,
              userName: meta.userName,
              clubId: meta.clubId,
              clubName: meta.clubName,
              eventDate: meta.eventDate,
              transactionId: transactionId,
              status: "paid",
              amount: session.amount_total / 100,
              registeredAt: new Date(),
            };

            const result = await eventRegistrationCollection.insertOne(
              registration
            );
            return res.send({
              success: true,
              type: "event",
              transactionId,
              result,
            });
          }
        }
        res
          .status(400)
          .send({ success: false, message: "Payment not completed" });
      } catch (error) {
        console.error("Error in payment-success:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    // event register
    app.get("/my-event-registrations", verifyFBtoken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { userEmail: email };
      const result = await eventRegistrationCollection.find(query).toArray();
      res.send(result);
    });
    // event-details

    app.get("/events/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.findOne(query);
      res.send(result);
    });
    // events
    app.get("/events", async (req, res) => {
      const searchText = req.query.searchText;
      const clubName = req.query.clubName;
      const sort = req.query.sort;

      let query = {};

      if (clubName) {
        query.clubName = { $regex: clubName, $options: "i" };
      }

      if (searchText) {
        query.title = { $regex: searchText, $options: "i" };
      }

      let sortOptions = { eventDate: 1 };
      if (sort === "newest") {
        sortOptions = { createdAt: -1 };
      }

      const result = await eventCollection
        .find(query)
        .sort(sortOptions)
        .toArray();
      res.send(result);
    });

    // Post a new event
    app.post("/events", verifyFBtoken, async (req, res) => {
      const event = req.body;

      event.createdAt = new Date();
      const result = await eventCollection.insertOne(event);
      res.send(result);
    });
    // post register

    app.post("/event-registrations", verifyFBtoken, async (req, res) => {
      const registration = req.body;

      const query = {
        eventId: registration.eventId,
        userEmail: registration.userEmail,
      };
      const alreadyRegistered = await eventRegistrationCollection.findOne(
        query
      );

      if (alreadyRegistered) {
        return res
          .status(400)
          .send({ message: "You have already registered for this event!" });
      }

      registration.registeredAt = new Date();
      const result = await eventRegistrationCollection.insertOne(registration);
      res.send(result);
    });

    // manage event
    app.get("/manageEvents", async (req, res) => {
      try {
        const email = req.query.email;

        const query = email ? { managerEmail: email } : {};

        const result = await eventCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });
    // event delete
    app.delete("/events/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.deleteOne(query);
      res.send(result);
    });
    // event edit
    app.patch("/events/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedData = {
        $set: {
          title: req.body.title,
          eventDate: req.body.eventDate,
          location: req.body.location,
        },
      };
      const result = await eventCollection.updateOne(filter, updatedData);
      res.send(result);
    });
    // middele more with database access
    const verifayAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // user related api

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email });
      if (userExists) {
        return res.send({ message: "user exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // users get
    app.get("/users", verifyFBtoken, async (req, res) => {
      const searchText = req.query.searchText;
      let query = {};

      if (searchText) {
        query.displayName = { $regex: searchText, $options: "i" };
      }

      const cursor = userCollection
        .find(query)
        .limit(10)
        .sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    // user patch
    app.patch(
      "/users/:id/role",
      verifyFBtoken,
      verifayAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    // user role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });
    // manager api
    app.post("/managers", async (req, res) => {
      const manager = req.body;
      (manager.status = "pending"), (manager.createdAt = new Date());
      const result = await managerCollection.insertOne(manager);
      res.send(result);
    });

    // managet get
    app.get("/managers", async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = managerCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // manager delete
    app.delete("/managers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await managerCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.send(result);
        } else {
          res.status(404).send({ message: "No manager found with this id" });
        }
      } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    // manager patch
    app.patch(
      "/managers/:id",
      verifyFBtoken,
      verifayAdmin,
      async (req, res) => {
        const status = req.body.status;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };
        const result = await managerCollection.updateOne(query, updateDoc);
        if (status === "approved") {
          const email = req.body.email;
          const userQuary = { email };
          const updateUser = {
            $set: {
              role: "manager",
            },
          };
          const userResult = await userCollection.updateOne(
            userQuary,
            updateUser
          );
        }
        res.send(result);
      }
    );
    //  club
    app.get("/club", async (req, res) => {
      const email = req.query.email;
      const limit = parseInt(req.query.limit);

      let query = {};
      if (email) {
        query = { email: email };
      }

      const cursor = clubCollection.find(query).sort({ createdAt: -1 });

      if (limit) {
        const result = await cursor.limit(limit).toArray();
        return res.send(result);
      }

      const result = await cursor.toArray();
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
    // delete

    app.delete("/club/:id", verifyFBtoken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await clubCollection.deleteOne(query);
      res.send(result);
    });
    // edit
    app.patch("/club/:id", verifyFBtoken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClub = req.body;
      const updateDoc = {
        $set: {
          clubName: updatedClub.clubName,
          description: updatedClub.description,
          category: updatedClub.category,
          location: updatedClub.location,
          bannerImage: updatedClub.bannerImage,
          membershipFee: updatedClub.membershipFee,
        },
      };
      const result = await clubCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // taka

    app.get("/all-payments", verifyFBtoken, verifayAdmin, async (req, res) => {
      try {
        const result = await eventRegistrationCollection
          .find()
          .sort({ registeredAt: -1 })
          .toArray();

        const totalAmount = result.reduce(
          (sum, payment) => sum + (parseFloat(payment.amount) || 0),
          0
        );

        res.send({
          payments: result,
          totalRevenue: totalAmount,
          totalCount: result.length,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch payments" });
      }
    });
    //
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
