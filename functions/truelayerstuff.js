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
