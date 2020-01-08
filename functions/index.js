const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

exports.addUser = functions
    .region("europe-west1")
    .auth.user()
    .onCreate(user => {
        return db
            .collection("users")
            .doc(user.uid)
            .set({
                email: user.email,
                name: "Kayttaja",
                isAvecAllowed: false,
                isFamilyAllowed: false,
                isAdmin: false,
                isAllowedToConfirm: true,
                createdAt: Date.now()
            })
            .then(() => {
                console.log("User added", user.uid);
                return db
                    .collection("guests")
                    .doc(user.uid)
                    .set({
                        account: user.uid,
                        name: user.email,
                        isAvec: false,
                        isFamilyMember: false,
                        isComing: null,
                        confirmedAt: null,
                        createdAt: Date.now()
                    })
                    .then(() => console.log("Guest added", user.uid))
                    .catch(err => console.error(err));
            })
            .catch(err => console.error(err));
    });

exports.deleteUser = functions
    .region("europe-west1")
    .auth.user()
    .onDelete(user => {
        return db
            .collection("users")
            .doc(user.uid)
            .delete()
            .then(() => {
                console.log("User deleted", user.uid);
                return db
                    .collection("guests")
                    .where("account", "==", user.uid)
                    .get()
                    .then(querySnapshot => {
                        const batch = db.batch();

                        querySnapshot.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        console.log("Deleting guest:", doc.id);

                        return batch
                            .commit()
                            .then(() => {
                                console.log("Batch committed");
                            })
                            .catch(err => console.error(err.message));
                    });
            })
            .catch(err => console.error(err));
    });

exports.removeGiftReservation = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
        const { uid } = context.auth;
        const { giftId } = data;
        let message = "Ok";

        if (!uid) {
            return { message: "Unauthorized" };
        }

        if (!giftId) {
            return { message: "Gift id was: " + giftId };
        }

        const docRef = db.collection("gifts").doc(giftId);

        const doc = await docRef.get();

        if (!doc.exists) {
            message = "No such gift " + giftId;
            console.log(message);
        } else {
            const gift = doc.data();
            if (gift.reservedBy === uid) {
                await docRef.update({ reservedBy: "" });
            } else {
                message = "Gift reserved by someone else " + gift.reservedBy;
                console.log(message);
            }
        }

        return { message: message, gift: giftId };
    });

exports.reserveGift = functions.region("europe-west1").https.onCall(async (data, context) => {
    const { uid } = context.auth;
    const { giftId } = data;
    let message = "Ok";

    if (!uid) {
        return { message: "Unauthorized" };
    }

    if (!giftId) {
        return { message: "Gift id was: " + giftId };
    }

    const docRef = db.collection("gifts").doc(giftId);

    const doc = await docRef.get();

    if (!doc.exists) {
        message = "No such gift " + giftId;
        console.log(message);
    } else {
        const gift = doc.data();
        if (gift.reservedBy) {
            message = "Gift already reserved by " + gift.reservedBy;
            console.log(message);
        } else {
            await docRef.update({ reservedBy: uid, reservedAt: Date.now() });
        }
    }

    return { message: message, gift: giftId };
});

exports.confirmArrival = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
        const { uid } = context.auth;
        const { giftId } = data;
        let message = "Ok";

        if (!uid) {
            return { message: "Unauthorized" };
        }

        if (!giftId) {
            return { message: "Gift id was: " + giftId };
        }

        const docRef = db.collection("gifts").doc(giftId);

        const doc = await docRef.get();

        if (!doc.exists) {
            message = "No such gift " + giftId;
            console.log(message);
        } else {
            const gift = doc.data();
            if (gift.reservedBy) {
                message = "Gift already reserved by " + gift.reservedBy;
                console.log(message);
            } else {
                await docRef.update({ reservedBy: uid, reservedAt: Date.now() });
            }
        }

        return { message: message, gift: giftId };
    });
