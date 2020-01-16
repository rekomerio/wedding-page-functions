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
        try {
            const { uid } = context.auth;
            const { giftId } = data;

            if (!uid) {
                return { message: "Unauthorized" };
            }

            if (!giftId) {
                return { message: "Gift id is required" };
            }

            const docRef = db.collection("gifts").doc(giftId);

            const doc = await docRef.get();

            if (!doc.exists) {
                return { message: "Gift not found", giftId };
            }

            const gift = doc.data();

            if (gift.reservedBy === uid) {
                // Remove reservation
                await docRef.update({ reservedBy: "" });
            } else {
                console.log(uid, "attempted to unreserve gift reserved by", gift.reservedBy);
                return { message: "You have not made the gift reservation", giftId };
            }

            console.log(giftId, "unreserved by", uid);
            return { message: "Ok", giftId };
        } catch (error) {
            console.error(error.message);
            return { message: error.message };
        }
    });

exports.reserveGift = functions.region("europe-west1").https.onCall(async (data, context) => {
    try {
        const { uid } = context.auth;
        const { giftId } = data;

        if (!uid) {
            return { message: "Unauthorized" };
        }

        if (!giftId) {
            return { message: "giftId is required" };
        }

        const docRef = db.collection("gifts").doc(giftId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return { message: "Gift not found", giftId };
        }

        const gift = doc.data();

        if (gift.reservedBy) {
            console.log(uid, "attempted to reserve gift reserved by", gift.reservedBy);
            return { message: "Gift is already reserved", giftId };
        }

        await docRef.update({ reservedBy: uid, reservedAt: Date.now() });

        console.log(giftId, "reserved to", uid);
        return { message: "Ok", giftId };
    } catch (error) {
        console.error(error.message);
        return { message: error.message };
    }
});
