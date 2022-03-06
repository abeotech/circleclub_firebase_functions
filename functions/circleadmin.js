const functions = require("firebase-functions");
// const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();

exports.sendPollNotification = functions.https.onCall((req, res) => {
  let title = "The election has been called.";
  let body = "Something has been changed in " + req.name;
  if (req.type == "name") {
    title = "A poll to change the circle name in " + req.name + " has been called.";
    body = "The change is successful. The new circle name is " + req.proposedValue;
  } else if (req.type == "contributionDate") {
    title = "A poll to change the contribution date in " + req.name + " has been called.";
    body = "The change is successful. New date is " + req.proposedValue;
  } else if (req.type == "payoutNumber") {
    title = "A poll to change the payout number in " + req.name + " has been called.";
    body = "New payout number is " + req.proposedValue;
  } else if (req.type == "contributionAmount") {
    title = "A poll to change the contribution amount has been called in " + req.name;
    body = "New contribution amount is " + req.proposedValue;
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

exports.sendFailedPollNotification = functions.https.onCall((req, res) => {
  const body = req.reason;
  let title = "A poll has been called in " + req.name;
  if (req.type == "name") {
    title = "A poll to change the circle name in " + req.name + " has been called.";
  } else if (req.type == "contributionDate") {
    title = "A poll to change the contribution date in " + req.name + " has been called.";
  } else if (req.type == "payoutNumber") {
    title = "A poll to change the payout number in " + req.name + " has been called.";
  } else if (req.type == "contributionAmount") {
    title = "A poll to change the contribution amount in " + req.name + " has been called.";
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
      "title": "New message from " + messageFrom,
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

exports.sendNewCircleMemberNotification = functions.https.onCall((req, res) => {
  // This function detects new messages to circle and notifies all the members of the circle
  console.log("New member push notifcation event triggered");
  const memberName = req.memberName;
  const circleName = req.circleName;
  const circleId = req.circleId;
  const message = memberName + " just joined " + circleName + ". Go say hello in the chat :)";
  // create notification
  const payload = {
    "data": {
      "body": message,
      "title": "A new member just joined " + circleName,
    },
    "notification": {
      "body": message,
      "title": "A new member just joined " + circleName,
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

exports.sendNewCircleInviteNotification = functions.https.onCall((req, res) => {
  const payload = {
    "data": {
      "body": req.invitee + " is inviting you to join their circle " + req.circleName,
      "title": "New circle invite from " + req.invitee,
    },
  };
  const options = {
    priority: "high",
    timeToLive: 60*60*24,
  };
  return admin.firestore().collection("notifications").doc("users").collection(req.userId).get().then((snapshot) => {
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
});
