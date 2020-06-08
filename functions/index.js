const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

exports.addUser = functions
    .region("europe-west1")
    .auth.user()
    .onCreate((user) => {
        const name = user.email.split("@")[0];
        return db
            .collection("users")
            .doc(user.uid)
            .set({
                email: user.email,
                name: name.charAt(0).toUpperCase() + name.slice(1),
                isAvecAllowed: false,
                isFamilyAllowed: false,
                isAdmin: false,
                isAllowedToConfirm: true,
                createdAt: Date.now(),
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
                        createdAt: Date.now(),
                    })
                    .then(() => console.log("Guest added", user.uid))
                    .catch((err) => console.error(err));
            })
            .catch((err) => console.error(err));
    });

exports.deleteUser = functions
    .region("europe-west1")
    .auth.user()
    .onDelete((user) => {
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
                    .then((querySnapshot) => {
                        const batch = db.batch();

                        querySnapshot.forEach((doc) => {
                            batch.delete(doc.ref);
                        });

                        return batch
                            .commit()
                            .then(() => {
                                console.log("Batch committed");
                            })
                            .catch((err) => console.error(err.message));
                    });
            })
            .catch((err) => console.error(err));
    });

exports.removeGiftReservation = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
        try {
            const { uid } = context.auth;
            const { giftId } = data;

            if (!uid) return { message: "Unauthorized" };
            if (!giftId) return { message: "Gift id is required" };

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

        if (!uid) return { message: "Unauthorized" };
        if (!giftId) return { message: "giftId is required" };

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

exports.addSong = functions.region("europe-west1").https.onCall(async (data, context) => {
    try {
        const { uid } = context.auth;
        const { name, artist } = data;

        if (!uid) return { message: "Unauthorized" };
        if (!name) return { message: "Song must have a name" };

        await db.collection("songs").add({
            name: name,
            artist: artist || null,
            addedBy: uid,
            createdAt: Date.now(),
        });

        return { message: "Ok" };
    } catch (err) {
        console.error(err.message);
        return { message: err.message };
    }
});

exports.removeSong = functions.region("europe-west1").https.onCall(async (data, context) => {
    try {
        const { uid } = context.auth;
        const { id } = data;

        if (!uid) return { message: "Unauthorized" };
        if (!id) return { message: "id is required" };

        const docRef = db.collection("songs").doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return { message: "Song not found", id };
        }

        const song = doc.data();

        if (song.addedBy !== uid) {
            console.log(uid, "attempted to delete song added by", song.addedBy);
            return { message: "You have not added this song", id };
        }

        await docRef.delete();

        return { message: "Ok" };
    } catch (err) {
        console.error(err.message);
        return { message: err.message };
    }
});

exports.renameGuests = functions.region("europe-west1").https.onRequest(async (req, res) => {
    try {
        const querySnapshot = await db.collection("guests").get();
        const batch = db.batch();

        querySnapshot.forEach((doc) => {
            const email = doc.data().name; // Email is incorrectly set as name so lets fix that
            if (email.includes("@")) {
                const firstName = email.split("@")[0];
                const lastName = email.split("@")[1].split(".")[0];
                batch.update(doc.ref, {
                    name:
                        firstName.charAt(0).toUpperCase() +
                        firstName.slice(1) +
                        " " +
                        lastName.charAt(0).toUpperCase() +
                        lastName.slice(1),
                });
            }
        });

        await batch.commit();
        res.status(200).send("Ok");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

exports.countGiftReservations = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {
        try {
            const querySnapshot = await db.collection("gifts").get();

            const giftCount = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.reservedBy) {
                    if (!giftCount[data.reservedBy]) giftCount[data.reservedBy] = 1;
                    else giftCount[data.reservedBy]++;
                }
            });
            res.status(200).send(giftCount);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });
