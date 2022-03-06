const functions = require("firebase-functions");
// const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
// this is a test key for stripe, replace with live keys when in production mode
const {Stripe} = require("stripe");
const stripe = new Stripe(functions.config().stripe.secrettest, {
  apiVersion: "2020-08-27",
});

exports.addStripeCustomer = functions.https.onCall((req, res) => {
  console.log("params: " + req.userId);
  createStripeCustomer(req.userId, req.email, req.name);
  return;
});

async function createStripeCustomer(userId, email, name) {
  // do something
  const customer = await stripe.customers.create({name: name, email: email,
  });
  const intent = await stripe.setupIntents.create({
    customer: customer.id,
  });
  return admin.firestore().collection("stripe_customers").doc(userId).set({
    customer_id: customer.id,
    setup_secret: intent.client_secret,
  });
}

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
