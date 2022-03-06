const functions = require("firebase-functions");
// const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
// this is a test key for stripe, replace with live keys when in production mode
const {Stripe} = require("stripe");
const stripe = new Stripe(functions.config().stripe.secrettest, {
  apiVersion: "2020-08-27",
});

// called by app when a user is about to add a payment method
exports.createStripeEphemeralKey = functions.https.onCall(async (req, res) => {
  // re-use customer
  const customerId = req.customer_id;
  // Create an ephemeral key for the Customer; this allows the app to display saved payment methods and save new ones
  const ephemeralKey = await stripe.ephemeralKeys.create(
      {customer: customerId},
      {apiVersion: "2020-08-27"},
  );
  // create a SetupIntent with the customerc
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
  });
  // send the object keys to the client
  const result = {
    setupIntent: setupIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customerId,
    publishableKey: functions.config().stripe.publishabletest,
  };
  return result;
});

// called by app to show saved payment methods
exports.listStripePaymentMethods = functions.https.onCall(async (req, res) => {
  const paymentMethods = await stripe.customers.listPaymentMethods(
      req.customer_id,
      {type: "card"},
  );
  const cards = paymentMethods["data"];
  // const keysToLookFor = ["card"];
  const cardsArray = [];
  await cards.forEach((card) => {
    const individualCards = {
      brand: card["card"]["brand"],
      last4: card["card"]["last4"],
      fingerprint: card["card"]["fingerprint"],
    };
    cardsArray.push(individualCards);
  });
  console.log(cardsArray);
  return cardsArray;
});

// called by app to store saved payment methods on firestore record
exports.updateFirestorewithStripePaymentMethods = functions.https.onCall(async (req, res) => {
  const paymentMethods = await stripe.customers.listPaymentMethods(
      req.customer_id,
      {type: "card"},
  );
  const cards = paymentMethods["data"];
  let count = 0;
  await cards.forEach((card) => {
    const individualCards = {
      brand: card["card"]["brand"],
      last4: card["card"]["last4"],
      fingerprint: card["card"]["fingerprint"],
      id: card.id,
    };
    admin.firestore().collection("users").doc(req.user_id).collection("contributionmethods").doc(String(count+1)).set(individualCards);
    count++;
  });
  return "function triggered. check logs for status";
});

"use strict";
const nodemailer = require("nodemailer");

exports.verifyBankAccountwithTrueLayer = functions.https.onCall((req, res) => {
  const options = {
    method: "POST",
    url: "https://verification.truelayer-sandbox.com/v1/verification",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": "Bearer " + req.token,
    },
    data: {name: req.name},
  };
  return axios.request(options)
      .then((response) => {
        const axiosRes = response.data["report"][0];
        // to avoid errors, i've constructed a new object from the response
        const result = {
          "verified": axiosRes["verifiable"],
          "account_holder_name": response.data["account_holder_name"],
          "provider_id": axiosRes["provider_id"],
          "iban": axiosRes["iban"],
        };
        console.log("Returned: ", axiosRes);
        addPayoutMethodToFireStore(result, req.user_id);
        return JSON.stringify(result);
      }).catch((error) => {
        console.log(error);
      });
});
