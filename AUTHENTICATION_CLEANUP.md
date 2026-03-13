# Authentication Cleanup Setup

## Overview
When a manager deletes a crew member, the system now:
1. ✅ **Immediately blocks login** - Deleted users cannot log in (client-side protection)
2. ✅ **Removes all data** - Deletes crew profile and user documents from Firestore
3. ⚠️ **Queues auth deletion** - Creates a request for Firebase Auth user deletion

## Current Protection (Active Now)
- Deleted users are immediately blocked from logging in
- A `deletedUsers` collection tracks all deleted accounts
- Login attempts by deleted users are rejected with a clear message
- All pages check for deleted user status on load

## Complete Setup (Optional - For Full Auth Cleanup)

To completely remove Firebase Authentication users (not just block them), deploy the Cloud Function:

### Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project with Blaze plan (required for Cloud Functions)

### Setup Steps

1. **Initialize Firebase Functions** (if not already done):
   ```bash
   firebase init functions
   ```

2. **Copy the Cloud Function**:
   - Copy `js/auth-cleanup.js` to your `functions/` directory
   - Rename it to `index.js` or add it to your existing `index.js`

3. **Install Dependencies**:
   ```bash
   cd functions
   npm install firebase-admin firebase-functions
   ```

4. **Deploy the Function**:
   ```bash
   firebase deploy --only functions
   ```

### How It Works

1. **Manager deletes crew** → Creates document in `authDeletionRequests` collection
2. **Cloud Function triggers** → Automatically deletes the Firebase Auth user
3. **Request marked as processed** → Prevents duplicate deletions

### Monitoring

Check the Firebase Console → Functions → Logs to monitor deletion requests.

## Security Notes

- Deleted users cannot log in even if their Firebase Auth account still exists
- The system is secure without the Cloud Function - it just leaves unused auth accounts
- Cloud Function provides complete cleanup for better account management

## Testing

1. Create a test crew member
2. Delete them via the manager interface
3. Try to log in with their credentials → Should be blocked immediately
4. Check `deletedUsers` collection → Should contain their record