const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { defineSecret } = require('firebase-functions/params');
const { onCall } = require('firebase-functions/v2/https');

initializeApp();

const voterSecret = defineSecret('VOTER_HASH_SECRET');
const options = { region: 'asia-southeast1', enforceAppCheck: true };
const { verifyVoter, castVote } = require('./voting')(getDatabase, voterSecret);
exports.verifyVoter = onCall({ ...options, secrets: [voterSecret] }, verifyVoter);
exports.castVote = onCall(options, castVote);
exports.manageElection = onCall({ ...options, timeoutSeconds: 540, secrets: [voterSecret] },
  require('./admin-election')(getDatabase, voterSecret));
