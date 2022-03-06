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

// Export all the functions in other files in their individual groups
exports.newmembers = require("./newmember");
exports.stripe = require("./stripefunding");
exports.truelayer = require("./truelayerstuff");
exports.tink = require("./tinkypayoutstuff");
exports.circleadmin = require("./circleadmin");
exports.contributions = require("./contributions")
// wip or ungrouped functions can stay in index.js
