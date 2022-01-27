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
const crypto = require("crypto");
const tlSigning = require("truelayer-signing");
// when a new user is created, create a Stripe customer object for them
exports.createStripeCustomer = functions.auth.user().onCreate(async (user) => {
  const customer = await stripe.customers.create({phone: user.phoneNumber,
  });
  const intent = await stripe.setupIntents.create({
    customer: customer.id,
  });
  await admin.firestore().collection("stripe_customers").doc(user.uid).set({
    customer_id: customer.id,
    setup_secret: intent.client_secret,
  });
  return;
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
    };
    admin.firestore().collection("users").doc(req.user_id).collection("contributionmethods").doc(String(count+1)).set(individualCards);
    count++;
  });
  return "function triggered. check logs for status";
});

"use strict";
const nodemailer = require("nodemailer");

// trigger to send welcome email to new users on sign up
exports.sendNewUserEmail = functions.firestore
    .document("users/{userId}")
    .onCreate((snap, context) =>{
      setTimeout(function() {
        const uId = context.params.userId;
        const displayName = snap.data().name; // the display name of the user
        return getEmailFromId(uId, displayName);
      }, 300000);
    });

const gmailEmail = functions.config().gmail.email;
const gmailPassword = functions.config().gmail.password;
const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

function getEmailFromId(uId, displayName) {
  admin.auth().getUser(uId)
      .then((userRecord) => {
        const email = userRecord.toJSON().email;
        console.log("email:" + email);
        sendWelcomeNotification(uId, displayName);
        return sendWelcomeEmail(email, displayName);
      }).catch((error) => {
        console.log("Error fetching email for welcome email" + error);
      });
}


// send welcome email function
async function sendWelcomeEmail(email, displayName) {
  const mailOptions = {
    from: "Circleclub",
    to: email,
  };
  mailOptions.text = "Welcome to circleclub.\n\nTo make this a smooth experience for you, we've put together this welcome guide called How to circleclub, at https://eede.notion.site/about-Circleclub-b2cb257af5c842ffb9e595fb22c56302 \n\nThanks,\n\nYour circleclub team";
  mailOptions.subject = "Welcome to circleclub";
  await mailTransport.sendMail(mailOptions);
  functions.logger.log("New welcome email sent to: ", email);
  return null;
}

// send welcome notification
async function sendWelcomeNotification(uId, displayName) {
  const payload = {
    "data": {
      "body": "Please make sure you visit the Account tab to read the guidelines and the how-to circleclub guide. Don't forget to get your friends and family on the app too!",
      "title": "Welcome to circleclub",
    },
  };
  const options = {
    priority: "high",
    timeToLive: 60*60*24,
  };
  return admin.firestore().collection("notifications").doc("users").collection(uId).get().then((snapshot) => {
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

// exports.getTrueLayerAccessToken = functions.https.onCall((req, res) => {
//   const options = {
//     url: "https://auth.truelayer-sandbox.com/connect/token",
//     method: "POST",
//     headers: {"Accept": "application/json", "Content-Type": "application/json"},
//     body: JSON.stringify({
//       grant_type: "authorization_code",
//       client_id: functions.config().truelayer.client_id,
//       client_secret: functions.config().truelayer.client_secret,
//       code: req.code,
//       redirect_uri: "https://joincircleclub.com/truelayer-redirect",
//     }),
//   };
//   const request = https.request(options, (response) => {
//     let data = "";
//     response.on("data", (chunk) => {
//       data += chunk;
//     });
//     response.on("end", () => {
//       console.log(JSON.parse(data));
//       return JSON.parse(data);
//     });
//     response.on("error", (error) => {
//       console.log(error.message);
//     });
//   });
//   request.end();
// });

const axios = require("axios");
exports.getTrueLayerAccessToken = functions.https.onCall((req, res) => {
  const options = {
    grant_type: "authorization_code",
    client_id: functions.config().truelayer.client_id,
    client_secret: functions.config().truelayer.client_secret,
    code: req.code,
    redirect_uri: "https://joincircleclub.com/truelayer-redirect",
  };
  return axios.post("https://auth.truelayer-sandbox.com/connect/token", options)
      .then((res) => {
        const axiosRes = res.data;
        // to avoid errors, i've constructed a new object from the response
        const result = {
          "token": axiosRes["access_token"],
          "expires_in": axiosRes["expires_in"],
          "scope": axiosRes["scope"],
        };
        admin.firestore().collection("truelayerRequestAccessCodes").doc(req.user_id).set(result);
        console.log(result);
        // console.log(res.data);
        return JSON.stringify(result);
      }, (error) =>{
        console.log(error);
      });
});

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

exports.getTrueLayerPayDirectToken = functions.https.onCall((req, res) => {
  const options = {
    method: "POST",
    url: "https://auth.truelayer-sandbox.com/connect/token",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    data: {
      grant_type: "client_credentials",
      client_id: functions.config().truelayer.client_id,
      client_secret: functions.config().truelayer.client_secret,
      scope: "paydirect",
    },
  };
  console.log("client_secret:" + functions.config().truelayer.client_secret);
  return axios.request(options).then((response) => {
    const axiosRes = response.data;
    console.log(axiosRes);
    return JSON.stringify(axiosRes);
  }).catch((error) => {
    console.log(error);
  });
});

exports.getTinkAccessToken = functions.https.onCall((req, res) => {
  const clientId = functions.config().tink.client_id;
  const clientSecret = functions.config().tink.client_secret;
  const dataString = "client_id=" + clientId + "&client_secret=" + clientSecret + "&grant_type=client_credentials&scope=account-verification-reports:read";
  const options = {
    method: "POST",
    url: "https://api.tink.com/api/v1/oauth/token",
    data: dataString,
  };
  return axios.request(options).then((response) => {
    const axiosRes = response.data;
    console.log(axiosRes);
    return JSON.stringify(axiosRes);
  }).catch((error) => {
    console.log(error);
  });
});

exports.getTinkAccountVerificationReport = functions.https.onCall((req, res) => {
  const options = {
    method: "GET",
    url: "https://api.tink.com/api/v1/account-verification-reports/" + req.report_id,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": "Bearer " + req.token,
    },
  };
  return axios.request(options).then((response) => {
    const axiosRes = response.data["userDataByProvider"][0];
    const accounts = axiosRes["accounts"][0];
    const name = axiosRes["identity"]["name"];
    const accountNumber = accounts["accountNumber"];
    const iban = accounts["iban"];
    // zoom in to identity
    const result = {
      "financialInstitutionName": axiosRes["financialInstitutionName"],
      "name": name,
      "accountNumber": accountNumber,
      "iban": iban,
    };
    console.log(axiosRes);
    console.log("accounts");
    console.log(accounts);
    console.log("result");
    console.log(result);
    // TODO: code to get full name from firebase
    // TODO: delete if John Doe placeholder
    if (name.includes("John Doe")) {
      const statusResult = {
        "status": "verified",
      };
      addPayoutMethodToFireStore(result, req.user_id);
      return JSON.stringify(statusResult);
    } else {
      const statusResult = {
        "status": "failed",
      };
      return JSON.stringify(statusResult);
    }
  }).catch((error) => {
    console.log(error);
  });
});

exports.startTrueLayerInitialPayout = functions.https.onCall(async (req, res) => {
  const body = {
    transaction_id: req.transaction_id,
    beneficiary_name: req.beneficiary_name,
    beneficiary_iban: req.beneficiary_iban,
    beneficiary_reference: req.beneficiary_reference,
    currency: req.currency,
    amount_in_minor: req.amount_in_minor,
    context_code: "withdrawal",
  };
  const kid = functions.config().truelayer.kid;
  const privateKeyPem = FS.readFileSync(Path.resolve(process.cwd(), "ec512-private-key.pem"), "utf-8");
  const idempotencyKey = req.user_id + "testPayout";
  const signature = tlSigning.sign({
    kid,
    privateKeyPem,
    method: "POST",
    path: "/payouts",
    headers: {"Idempotency-Key": idempotencyKey},
    body,
  });
  const options = {
    method: "POST",
    url: "https://paydirect.truelayer-sandbox.com/v1/withdrawals",
    headers: {
      "Accept": "application/json; charset=UTF-8",
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + req.paydirect_token,
      "X-TL-Signature": signature,
    },
    data: {
      transaction_id: idempotencyKey,
      beneficiary_name: req.beneficiary_name,
      beneficiary_iban: req.beneficiary_iban,
      beneficiary_reference: req.beneficiary_reference,
      currency: req.currency,
      amount_in_minor: 10,
      context_code: "withdrawal",
    },
  };
  await console.log("testSignature" + testSignature(req.paydirect_token, idempotencyKey, kid, privateKeyPem));
  return axios.request(options).then((response) => {
    const axiosRes = response.data;
    console.log(axiosRes);
    return JSON.stringify(axiosRes);
  }).catch((error) => {
    console.log(error);
  });
});

function testSignature(paydirecttoken, idempotencyKey, kid, privateKeyPem) {
  const body = {
    "nonce": "9f952b2e-1675-4be8-bb39-6f4343803c2f",
  };
  const signature = tlSigning.sign({
    kid,
    privateKeyPem,
    method: "POST",
    path: "/payouts",
    headers: {"Idempotency-Key": idempotencyKey},
    body,
  });
  const options = {
    method: "POST",
    url: "https://paydirect.truelayer-sandbox.com/v1/test-signature",
    headers: {
      "Authorization": "Bearer " + paydirecttoken,
      "X-TL-Signature": signature,
    },
    data: {
      "nonce": "9f952b2e-1675-4be8-bb39-6f4343803c2f",
    },
  };
  return axios.request(options).then((response) => {
    return response.data;
  }).catch((error) => {
    console.log(error);
  });
}

function addPayoutMethodToFireStore(result, userId) {
  const algorithm = "aes-256-cbc";
  const initVector = crypto.randomBytes(16);
  const securityKey = crypto.createHash("sha256").update(String(userId)).digest("base64").substr(0, 32);
  const cipher = crypto.createCipheriv(algorithm, securityKey, initVector);
  const encryptedIbanResult = {
    "verified": "verified",
    "account_holder_name": result.name,
    "iban": cipher.update(result.iban, "utf-8", "hex"),
    "provider_id": result.financialInstitutionName,
  };
  encryptedIbanResult.iban = initVector + encryptedIbanResult.iban;
  return admin.firestore().collection("users").doc(userId).collection("payoutmethods").add(encryptedIbanResult).then(() => {
    console.log("Payout method added to firestore for: " + userId[0, 6]);
  }).catch((error) => {
    console.log(error);
  });
}

exports.sendPollNotification = functions.https.onCall((req, res) => {
  let title = "The election has been called.";
  let body = "Something has been changed in " + req.name;
  if (req.type == "name") {
    title = "The election has been called in " + req.name + ". Circle name has been changed.";
    body = "New name is " + req.proposedValue;
  } else if (req.type == "contributionDate") {
    title = "The election has been called in " + req.name + ". Contribution date has been changed.";
    body = "New date is " + req.proposedValue;
  } else if (req.type == "payoutNumber") {
    title = "The election has been called in " + req.name + ". Payout number has been changed.";
    body = "New date is " + req.proposedValue;
  } else if (req.type == "contributionAmount") {
    title = "The election has been called in " + req.name + ". Contribution amount has been changed.";
    body = "New date is " + req.proposedValue;
  }
  const payload = {
    "notification": {
      "title": title,
      "body": body,
      "circleId": req.circleId,
    },
    "data": {
      "body": body,
      "title": title,
    },
  };
  const options = {
    priority: "high",
    timeToLive: 60*60*24,
  };
  return admin.firestore().collection("notifications").doc(req.circleId).collection("tokens").get().then((snapshot) => {
    if (snapshot.empty) {
      console.log("Couldn't fetch notification tokens for " + req.circleId);
      return;
    } else {
      const tokens = [];
      snapshot.forEach((doc) => {
        const dataObj = doc.data();
        tokens.push(dataObj[Object.keys(dataObj)[0]]);
      });
      return admin.messaging().sendToDevice(tokens, payload, options);
    }
  }).catch((error) => {
    console.log("Couldn't fetch notification tokens " + error);
  });
});

exports.messageNotifications = functions.firestore.document("chats/{docId}/messages/{messageId}").onCreate((snap, context) => {
  // This function detects new messages to circle and notifies all the members of the circle
  console.log("Push notifcation event triggered");
  const newValue = snap.data();
  const messageFrom = newValue.sentBy;
  const message = newValue.messageText;
  const circleId = newValue.circleId;
  console.log("messageFrom:" + messageFrom);
  // create notification
  const payload = {
    "data": {
      "body": message,
      "title": "New circle channel message from " + messageFrom,
      "circleId": circleId,
    },
    "notification": {
      "body": message,
      "title": "New circle channel message from " + messageFrom,
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

exports.updateFirebaseMessagingToken = functions.https.onCall(async (req, res) => {
  const token = req.token;
  const uId = req.uId;
  const tokenObj = {
    uId: token,
  };
  return firebaseMessagingTokenUpdateService(uId, token, tokenObj);
});

async function firebaseMessagingTokenUpdateService(uId, token, tokenObj) {
  const personalNotifRes = await admin.firestore().collection("notifications").doc("users").collection(uId).doc(uId).set(tokenObj);
  // TODO: search for circles, get circle ids, update notifications
  console.log(personalNotifRes);
  // search for circle memberships and overwrite token in each
  // note that for apple, android and java, the comparison Equal is explicity named in the method
  return admin.firestore().collection("circles").where(uId, "==", true).get().then((snapshot) => {
    snapshot.forEach((doc) => {
      console.log(doc.data().circleId);
      admin.firestore().collection("notifications").doc(doc.data().circleId).collection("tokens").doc(uId).set(tokenObj);
    });
  }).catch((error) => {
    console.log("Something went wrong with updating circle notifications token for user with user id " + uId);
  });
}
