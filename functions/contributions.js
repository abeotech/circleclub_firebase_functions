const functions = require("firebase-functions");
// const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
// this is a test key for stripe, replace with live keys when in production mode
const {Stripe} = require("stripe");
const FS = require("fs");
const Path = require("path");
const stripe = new Stripe(functions.config().stripe.secrettest, {
  apiVersion: "2020-08-27",
});

/// circle stripe subscriptions trasnslated for circleclub
// customers are circle members. The Customer object stores information like names, email addresses, and payment methods (credit cards, debit cards, and so on)
// products are circle memberships essentially
// prices are the contribution amounts payable for that circle membership
// To create and activate a subscription, you first need to create a Product (circle membership) when a circle is created, to model what is being sold, and a Price (contribution amount) which determines the interval (frequency specified in circle attrs) and amount to charge.
// You’ll also need a Customer to store PaymentMethods used to make each recurring payment (done at sign up).

// first create a product

exports.createStripeProductAndPrice = functions.https.onCall(async (req, res) => {
  const id = req.circle_id;
  const name = req.circle_name;
  const rawAmount = req.contribution_amount;
  const frequency = req.frequency;
  let interval = "month";
  let intervalCount = "1";
  if (frequency.includes("monthly")) {
    interval = "month";
    intervalCount = "1";
  } else if (frequency.includes("two weeks")) {
    interval = "week";
    intervalCount = "2";
  }
  const product = await stripe.products.create({
    name: name,
    id: id,
  });
  // record product information on firestore
  await admin.firestore().collection("stripe_products").doc(id).set(product);
  // use the product id to create a price (contribution amount) for the product
  // the unit_amount number is cents / pence, so 10000 = 100 GBP for example, so always multiply or divide raw firestore values by 100 as needed
  const price = await stripe.prices.create({
    unit_amount: parseInt(rawAmount) * 100,
    currency: "gbp",
    recurring: {
      interval: interval,
      interval_count: intervalCount,
    },
    product: id,
  });
  // record product information on firestore
  // TODO: check for errors
  await admin.firestore().collection("stripe_prices").doc(id).set(price);
  // Next steps: when a payout table has been created, call createStripeSubscription, and use data in stripe_products and stripe_prices
  // https://stripe.com/docs/billing/subscriptions/build-subscription?ui=elements
  // https://stripe.com/docs/api/prices/create?lang=node
});

exports.createStripeSubscription = functions.https.onCall(async (req, res) => {
  const circleId = req.circle_id;
  const listOfMembers = req.circle_members;
  const startDateTimeStamp = req.start_date_timestamp;
  // const listOfMembersRaw = [];
  // listOfMembersRaw.push(Object.keys(membersRaw));
  // const listOfMembers = listOfMembersRaw[0];
  // forEach, retrieve payment method id from firestore and pass as default_payment_method
  const priceDoc = await admin.firestore().collection("stripe_prices").doc(circleId).get();
  const priceId = priceDoc.data().id;
  listOfMembers.forEach(async (item, index) => {
    console.log(item, index);
    const stripeCustomerDoc = await admin.firestore().collection("stripe_customers").doc(item).get();
    const stripeCustomerId = stripeCustomerDoc.data().customer_id;
    const paymentFirestoreDoc = await admin.firestore().collection("users").doc(item).collection("circles").doc(circleId).collection("preferences").doc("authorization").get();
    console.log(paymentFirestoreDoc);
    const stripePaymentMethodId = paymentFirestoreDoc.data().id;
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {price: priceId},
      ],
      default_payment_method: stripePaymentMethodId,
      payment_behavior: "allow_incomplete",
      billing_cycle_anchor: startDateTimeStamp,
      proration_behavior: "none",
      metadata: {"circleId": circleId, "userId": req.userId},
    });
    console.log(subscription);
    // log to circle records and then to individual record
    await admin.firestore().collection("transactionlogs").doc(circleId).collection("subscriptions").doc(item).set(subscription);
    await admin.firestore().collection("transactionlogs").doc(item).collection("subscriptions").doc(subscription.id).set(subscription);
    return {"status": "complete"};
  });
});


exports.createPayoutTable = functions.https.onCall((req, res) => {
  const duration = req.duration;
  const payoutnumber = req.payoutnumber;
  const members = req.members;
  const scheduleId = req.scheduleId;
  const startDateTimeStamp = req.longUnixTimestamp;
  const monthOne = req.currentMonth;
  const changeLog = req.changeLog;
  const transactionLog = req.transactionLog;
  const contributionTracker = req.contributionTracker;
  const contributionDate = req.contributionDate;
  const circleId = req.circleId;
  const circleName = req.circleName;
  const options = {
    method: "POST",
    url: "https://us-central1-circleclub-100.cloudfunctions.net/new_payout_table_script",
    data: {
      duration: duration,
      payoutnumber: payoutnumber,
      members: members,
    },
  };
  return axios.request(options).then((response) => {
    console.log(response.data);
    const axiosRes = response.data;
    const keyValueObj = {};
    for (let i=0; i<axiosRes.length; i++) {
      keyValueObj[i] = axiosRes[i];
    }
    const firestoreData = {
      startDateTimeStamp: startDateTimeStamp,
      monthOne: monthOne,
      balance: 0,
      changeLog: changeLog,
      transactionLog: transactionLog,
      activePayoutTable: keyValueObj,
      contributionTracker: contributionTracker,
      hasPayoutTableFirstInstanceRun: true,
      payoutTracker: 0,
    };
    console.log(keyValueObj);
    addScheduleToFirestore(firestoreData, scheduleId, circleId, circleName, contributionDate);
    return JSON.stringify({"success": true});
  }).catch((error) => {
    console.log(error);
  });
});

function addScheduleToFirestore(firestoreData, scheduleId, circleId, circleName, contributionDate) {
  admin.firestore().collection("firstContributionsNotifications").doc(circleId).set({"status": "due", "circleId": circleId, "circleName": circleName, "contributionDate": contributionDate});
  return admin.firestore().collection("schedules").doc(scheduleId).set(firestoreData).then(() => {
    console.log("schedule updated. Schedule id is " + scheduleId);
  }).catch((error) => {
    console.log(error);
  });
}

// trigger to send contributions due
exports.sendFirstContributionsHeadsUp = functions.firestore
    .document("firstContributionsNotifications/{circleId}")
    .onCreate((snap, context) =>{
      const circleId = context.params.circleId;
      const circleName = context.params.circleName;
      const contributionDate = context.params.contributionDate;
      const message = "Hi there :) " + circleName + " now has enough members for a schedule and we've made one for you! Click the calendar icon in the circle to see who's getting paid first :) Please make sure you have enough money in the card you've picked for this circle. To remind yourself which card that is, go to the circle > click on your profile picture > preferences. Contributions are first due on day " + contributionDate + " of this month. Happy circleclubbing.";
      // create notification
      const payload = {
        "data": {
          "body": message,
          "title": "New " + circleName + " schedule just dropped.",
        },
        "notification": {
          "body": message,
          "title": "New " + circleName + " schedule just dropped.",
        },
      };
      const options = {
        priority: "high",
        timeToLive: 60*60*24,
      };
      console.log("circle id: " + circleId);
      return admin.firestore().collection("notifications").doc(circleId).collection("tokens").get().then((snapshot) => {
      // run through documents and make a list of values which represent notification tokens
        if (snapshot.empty) {
          console.log("No documents found.");
        }
        const tokens = [];
        snapshot.forEach((doc) => {
          const dataObj = doc.data();
          tokens.push(dataObj[Object.keys(dataObj)[0]]);
        });
        return admin.messaging().sendToDevice(tokens, payload, options);
      }).catch((error) => {
        console.log("Somthing went wrong" + error);
      });
    });

const webhookSecret = functions.config().stripe.webhooks_secret;
exports.stripeSubscriptionEvents = functions.https.onRequest((request, response) => {
  // get the signature from the request header
  const signature = request.headers["stripe-signature"];
  // verify against our endpoint secret
  try {
    const event = stripe.webhooks.constructEvent(request.rawBody, signature, webhookSecret); // validate the event
    console.log(event);
    return admin.firestore().collection("stripeEvents").add(event).then((snapshot) => {
      // TODO: check what type of event and log to relevant circle
      if (event.type == "invoice.paid") {
        // subscription was successful, log as needed
        // TODO: find the relevant circle from the subscription params
        // log to circleId transactionLog activecontributiontracker as a successfulcontribution
        // log to contribution tracker
        const subscription = event.data;
        const subscriptionObj = subscription.object;
        const metadata = subscription.metadata;
        // group logs
        admin.firestore().collection("transactionlogs").doc(metadata.circleId).collection("activeSuccessfulContributionsTracker").add(event);
        // individual logs
        admin.firestore().collection("transactionlogs").doc(metadata.circleId).collection(metadata.userId).add(event);
        // TODO: implement if tracker == duration check (if number of docs in grouped collection == duration, cancel subscription)  
        sendSuccessfulContributionEmail(metadata.userId, metadata.circleId);
        sendSuccessfulContributionNotification(metadata.userId, metadata.circleId);
      } else if (event.type == "invoice.paymentfailed") {
        // payment failed, notify circle member and log; TODO: disable payouts until payment is successful
        // log to failed collectionsendSuccessfulContributionEmail(metadata.userId, metadata.circleId);
        admin.firestore().collection("transactionlogs").doc(metadata.circleId).collection("activeFailedContributionsTracker").add(event);
        sendFailedContributionEmail(metadata.userId, metadata.circleId);
        sendFailedContributionNotification(metadata.userId, metadata.circleId);
      }
      // Return a successful response to acknowledge the event was verified
      return response.json({received: true, ref: snapshot.id.toString()});
    }).catch((err) => {
      console.error(err);
      return response.status(500).end();
    });
    // TODO: find relevant payout tables and update with invoice created records or invoice paid records
  } catch (err) {
    return response.status(400).end(); // Signing signature failure, return an error 400
  }
});

async function sendSuccessfulContributionNotification(userId, circleId) {
  // get circle name
  // get firestore circle document first
  const doc = await admin.firestore().collection("circles").doc(circleId).get();
  if (!doc.exists){
    const docData = doc.data();
    const circleName = docData.name;
    const payload = {
      "data": {
        "body": "Your contribution to " + circleName + " was successful!",
        "title": "Contribution alert",
      },
    };
    const options = {
      priority: "high",
      timeToLive: 60*60*24,
    };
    return admin.firestore().collection("notifications").doc("users").collection(userId).get().then((snapshot) => {
      // run through documents and make a list of values which represent notification tokens
      if (snapshot.empty) {
        console.log("No documents found.");
      }
      const listOfTokens = [];
      // const listOfKeys = [];
      snapshot.forEach((doc) => {
        // const miniList = [];
        const dataObj = doc.data();
        // miniList.push(Object.keys(doc.data()));
        // listOfKeys.push(miniList[0]);
        listOfTokens.push(dataObj[Object.keys(dataObj)[0]]);
        console.log(dataObj + " compared to " + listOfTokens);
      });
      return admin.messaging().sendToDevice(listOfTokens, payload, options);
    }).catch((error) => {
      console.log("Something went wrong" + error);
    });
  }
}

async function sendFailedContributionNotification(userId, circleId) {
  // get circle name
  // get firestore circle document first
  const doc = await admin.firestore().collection("circles").doc(circleId).get();
  if (!doc.exists){
    const docData = doc.data();
    const circleName = docData.name;
    const payload = {
      "data": {
        "body": "Your contribution to " + circleName + " failed. We'll retry the payment attempt or contact you via email if there is a further problem with your payment method.",
        "title": "Failed Contribution alert",
      },
    };
    const options = {
      priority: "high",
      timeToLive: 60*60*24,
    };
    return admin.firestore().collection("notifications").doc("users").collection(userId).get().then((snapshot) => {
      // run through documents and make a list of values which represent notification tokens
      if (snapshot.empty) {
        console.log("No documents found.");
      }
      const listOfTokens = [];
      // const listOfKeys = [];
      snapshot.forEach((doc) => {
        // const miniList = [];
        const dataObj = doc.data();
        // miniList.push(Object.keys(doc.data()));
        // listOfKeys.push(miniList[0]);
        listOfTokens.push(dataObj[Object.keys(dataObj)[0]]);
        console.log(dataObj + " compared to " + listOfTokens);
      });
      return admin.messaging().sendToDevice(listOfTokens, payload, options);
    }).catch((error) => {
      console.log("Something went wrong" + error);
    });
  }
}
