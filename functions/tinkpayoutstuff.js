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
