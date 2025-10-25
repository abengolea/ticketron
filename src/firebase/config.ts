// @ts-nocheck
// TODO: Replace with your Firebase project's configuration object
// See: https://firebase.google.com/docs/web/learn-more#config-object
export const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:1234567890abcdef"
};

// This is a temporary guard to prevent the app from crashing.
// You should replace the placeholder config above.
if (firebaseConfig.apiKey.startsWith("AIzaSyXXX")) {
    console.warn("Firebase config is not set. Please update src/firebase/config.ts");
}
